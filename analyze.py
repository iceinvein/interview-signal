#!/usr/bin/env python3
"""Print every number the interview-signal post quotes, from the committed run data.

Usage: python3 analyze.py [--runs runs] [--excluded runs-excluded] [--tasks tasks]
                          [--handcheck handcheck.json] [--transcripts DIR]

--transcripts names a tree holding the gitignored transcript.jsonl files in the same
runs/ and runs-excluded/ layout (the main checkout). Without it the isolation audit
and the incident report are skipped and the output says so.
"""

import argparse
import collections
import hashlib
import json
import math
import pathlib
import random
import re
import statistics
import sys
import urllib.parse

REPO = pathlib.Path(__file__).resolve().parent
AGENT_ORDER = ["sonnet", "opus", "codex", "haiku"]
SAMPLE_FRACTION = 0.2  # fixed by the design: a seeded 20% of judged labels is relabelled by hand
FEEDME_REQUIREMENTS = [
    "req1-normal-flow", "req2-vip-priority", "req3-order-numbers",
    "req4-bot-processing", "req5-idle-bot", "req6-remove-bot",
]

# Judge spend was not stored per run. These are the totals the judge printed, from
# docs/plans/2026-09-27-interview-signal-record.md; the middle batch of the full run
# crashed before printing its summary, so only its call count is known.
JUDGE_BATCHES_KNOWN = [("pilot", 108, 13.72), ("full run, last batch", 135, 27.06), ("FeedMe rerun", 270, 34.57), ("Codex FeedMe rerun, second batch", 36, 4.26)]
# The first Codex FeedMe rerun batch (3 runs, 54 calls) stopped on a usage limit before printing its cost.
EXCLUDED_GROUPS = {
    "feedme-host-isolation": "the 15 original FeedMe runs, run with the operator's HOME (Codex opened public PRs with the operator's gh login)",
    "feedme-codex-connector": "the 5 container Codex FeedMe runs that had the ChatGPT GitHub connector (3 used it read-only as the operator)",
}
JUDGE_BATCH_LOST_CALLS = 1242

RESERVED_SUFFIXES = (".example", ".test", ".invalid", ".localhost")
RESERVED_DOMAINS = ("example.com", "example.net", "example.org")
LOOPBACK_HOSTS = ("localhost", "::1", "[::1]", "0.0.0.0")

CONFIG_PATTERN = re.compile(r"\.claude\b|\.codex\b|CLAUDE\.md|AGENTS\.md|\.ssh\b|\.config/gh\b|\.netrc\b")
TOKEN_PATTERN = re.compile(r"[^\s'\"`;|&()<>,{}\[\]]*(?:" + CONFIG_PATTERN.pattern + r")[^\s'\"`;|&()<>,{}\[\]]*")
PARENT_PATH = re.compile(r"(^|[\s'\"=])\.\.(/|$|[\s'\"])")
FOUND_FILE = re.compile(r"^(?!find:|ls:|rg:|grep:).*(AGENTS|CLAUDE)\.md\s*$", re.MULTILINE)
WORK_DIR = re.compile(r"(?<![\w.])/work(?![\w-])")
PUSH_OK = re.compile(r"^To \S+|\[new branch\]|remote: Create a pull request|^\s+[0-9a-f]{7,}\.\.[0-9a-f]{7,}\s", re.MULTILINE)
PR_URL = re.compile(r"https://github\.com/[\w.-]+/[\w.-]+/pull/\d+")
REPO_URL = re.compile(r"https://github\.com/[\w.-]+/[\w.-]+(?![\w./-])")
GH_REPO_ARG = re.compile(r"gh api (?:-X \w+ )?['\"]?repos/([\w.-]+/[\w.-]+)|gh repo (?:view|fork|clone) ([\w.-]+/[\w.-]+)")


# ---------------------------------------------------------------------------
# Loading


def load_runs(runs_dir):
    runs = []
    for d in sorted(p for p in pathlib.Path(runs_dir).iterdir() if p.is_dir()):
        result = json.loads((d / "result.json").read_text())
        score = json.loads((d / "score.json").read_text())
        judge_path = d / "judge.json"
        judge = json.loads(judge_path.read_text()) if judge_path.exists() else None
        labels = {c["id"]: ("met" if c["passed"] else "not_met") for c in score.get("auto_criteria", [])}
        trap = None
        if judge is not None:
            labels.update({c["id"]: c["label"] for c in judge["criteria"]})
            trap = judge.get("trap")
        runs.append({
            "name": d.name, "dir": d, "format": result["format"], "task": result["task"],
            "agent": result["agent"], "rep": result["rep"], "result": result, "score": score,
            "labels": labels, "trap": trap,
        })
    return runs


def load_rubric(tasks_dir, fmt, task):
    return json.loads((pathlib.Path(tasks_dir) / fmt / task / "rubric.json").read_text())


def agents_in(runs):
    present = {r["agent"] for r in runs}
    return [a for a in AGENT_ORDER if a in present] + sorted(present - set(AGENT_ORDER))


# ---------------------------------------------------------------------------
# Pure measures


def average_ranks(values):
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        for k in range(i, j + 1):
            ranks[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return ranks


def spearman(xs, ys):
    """Pearson correlation of average ranks; None when either side has no spread."""
    rx, ry = average_ranks(xs), average_ranks(ys)
    mx, my = statistics.fmean(rx), statistics.fmean(ry)
    sxx = sum((a - mx) ** 2 for a in rx)
    syy = sum((b - my) ** 2 for b in ry)
    if sxx == 0 or syy == 0:
        return None
    return sum((a - mx) * (b - my) for a, b in zip(rx, ry)) / math.sqrt(sxx * syy)


def is_ignorable_host(host):
    host = host.lower().rstrip(".")
    if host in LOOPBACK_HOSTS or host.startswith("127.") or "." not in host:
        return True
    if host.endswith(RESERVED_SUFFIXES):
        return True
    return any(host == d or host.endswith("." + d) for d in RESERVED_DOMAINS)


def split_fetches(entries):
    """Separate gh invocations, drop reserved, loopback and bare hosts, keep the rest."""
    kept, gh = [], []
    for entry in entries:
        if entry == "gh" or entry.startswith("gh "):
            gh.append(entry)
            continue
        host = urllib.parse.urlsplit(entry).hostname
        if host is not None and is_ignorable_host(host):
            continue
        kept.append(entry)
    return kept, gh


def criterion_table(runs, task, criterion_ids):
    table = {}
    task_runs = [r for r in runs if r["task"] == task]
    for cid in criterion_ids:
        row = {}
        for agent in agents_in(task_runs):
            mine = [r for r in task_runs if r["agent"] == agent]
            row[agent] = (sum(r["labels"].get(cid) == "met" for r in mine), len(mine))
        table[cid] = row
    return table


def met_by_all(table):
    return [cid for cid, row in table.items() if all(met == n for met, n in row.values())]


def met_by_none(table):
    return [cid for cid, row in table.items() if all(met == 0 for met, _ in row.values())]


def mixed_cells(table):
    return [(cid, agent) for cid, row in table.items() for agent, (met, n) in row.items() if 0 < met < n]


def output_digest(output_dir):
    digest = hashlib.sha256()
    for path in sorted(p for p in output_dir.rglob("*") if p.is_file()):
        digest.update(str(path.relative_to(output_dir)).encode() + b"\0" + path.read_bytes() + b"\0")
    return digest.hexdigest()


def output_digests(runs):
    groups = collections.defaultdict(list)
    for r in runs:
        groups[(r["task"], r["agent"])].append(output_digest(r["dir"] / "output"))
    return groups


def identical_output_groups(runs):
    """Task x agent groups whose repeats all produced byte-identical output."""
    return sorted(k for k, digests in output_digests(runs).items() if len(digests) > 1 and len(set(digests)) == 1)


def repeated_output_groups(runs):
    """Task x agent groups where at least two repeats produced byte-identical output."""
    return sorted(k for k, digests in output_digests(runs).items() if len(set(digests)) < len(digests))


def exercised_rate(rows, criterion):
    counted = [r for r in rows if r["criterion"] == criterion and r["exercised"]]
    return sum(r["hand"] == "met" for r in counted), len(counted)


def judged_population(runs):
    population = []
    for r in runs:
        judge_path = r["dir"] / "judge.json"
        if not judge_path.exists():
            continue
        judge = json.loads(judge_path.read_text())
        population += [(r["name"], c["id"], c["label"]) for c in judge["criteria"]]
        if judge.get("trap"):
            population.append((r["name"], "trap:" + judge["trap"]["id"], judge["trap"]["label"]))
    return sorted(population)


def draw_sample(runs, seed, fraction):
    population = judged_population(runs)
    return sorted(random.Random(seed).sample(population, round(fraction * len(population))))


def agreement(rows):
    return sum(r["judge"] == r["hand"] for r in rows), len(rows)


def pct(met, n):
    return f"{met}/{n} ({100 * met / n:.0f}%)" if n else "0/0"


# ---------------------------------------------------------------------------
# Transcripts


def transcript_actions(path):
    """Yield (kind, text, output) for every action the agent took, in order."""
    pending = {}
    for line in pathlib.Path(path).read_text().splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("type") == "system" and event.get("subtype") == "init":
            yield "init", json.dumps(event), ""
        elif event.get("type") == "assistant":
            for block in event["message"].get("content", []):
                if block.get("type") == "tool_use":
                    pending[block["id"]] = (block["name"], json.dumps(block["input"]))
        elif event.get("type") == "user" and isinstance(event["message"].get("content"), list):
            for block in event["message"]["content"]:
                if block.get("type") == "tool_result" and block.get("tool_use_id") in pending:
                    name, text = pending.pop(block["tool_use_id"])
                    content = block.get("content")
                    yield "tool:" + name, text, content if isinstance(content, str) else json.dumps(content)
        elif event.get("type") == "item.completed":
            item = event["item"]
            kind = item.get("type")
            if kind == "command_execution":
                yield "command", item.get("command", ""), item.get("aggregated_output") or ""
            elif kind == "file_change":
                yield "file", json.dumps(item.get("changes")), ""
            elif kind == "mcp_tool_call":
                arguments = item.get("arguments") or {}
                yield "mcp", f"{item.get('server')}.{item.get('tool')}", arguments.get("repository_full_name") or ""
            elif kind == "web_search":
                yield "web", item.get("query", ""), ""
    for name, text in pending.values():
        yield "tool:" + name, text, ""


def strip_private(path):
    return path[len("/private"):] if path.startswith("/private/") else path


def reference_category(token):
    if "/.claude/projects/" in token:
        return "claude-session-dir"
    if ".codex" in token:
        return "codex-home"
    if re.search(r"CLAUDE\.md|AGENTS\.md", token):
        return "instruction-file"
    if ".claude" in token:
        return "claude-home"
    return "credential-path"


def is_outside(token, text, cwd):
    if token.startswith(("/", "~", "$HOME", "${HOME}")):
        return not (cwd and strip_private(token).startswith(strip_private(cwd)))
    if ".." in token.split("/"):
        return True
    return bool(PARENT_PATH.search(text))


def scan_transcript(path):
    cwd = None
    work_seen = False
    scan = {"inside": [], "outside": [], "found_instruction_file": False, "found_lines": [],
            "connector_calls": [], "connector_repos": set(), "web_searches": [], "init_mcp_servers": set()}
    for kind, text, output in transcript_actions(path):
        if kind == "init":
            event = json.loads(text)
            cwd = cwd or event.get("cwd")
            scan["init_mcp_servers"].update(m.get("name") for m in event.get("mcp_servers", []))
            continue
        if kind == "mcp":
            scan["connector_calls"].append(text)
            if output:
                scan["connector_repos"].add(output)
            continue
        if kind == "web" or kind in ("tool:WebSearch", "tool:WebFetch"):
            scan["web_searches"].append(text)
            continue
        if WORK_DIR.search(text) or WORK_DIR.search(output):
            work_seen = True
        tokens = [m.group(0) for m in TOKEN_PATTERN.finditer(text)]
        if not tokens:
            continue
        outside = [t for t in tokens if is_outside(t, text, cwd)]
        if outside:
            scan["outside"].append((reference_category(outside[0]), text[:200], output[:200]))
        else:
            scan["inside"].append(text[:200])
        found = FOUND_FILE.findall(output) and [m.group(0) for m in FOUND_FILE.finditer(output)]
        if found:
            scan["found_instruction_file"] = True
            scan["found_lines"] += found
    scan["cwd"] = cwd
    scan["environment"] = "container" if cwd == "/work" or (cwd is None and work_seen) else "host"
    return scan


def incident_actions(path):
    actions = {"pushed": False, "pull_requests": [], "forks": [], "web_searches": [], "github_searches": 0,
               "repos_touched": set(), "gh_logged_in": False, "signing_key_prompt": False,
               "sibling_run_dirs": False, "set_git_identity": False}
    for kind, text, output in transcript_actions(path):
        if kind == "web" or kind == "tool:WebSearch":
            actions["web_searches"].append(text)
            continue
        if kind == "mcp":
            if ".search" in text:
                actions["github_searches"] += 1
            continue
        if kind not in ("command", "tool:Bash"):
            continue
        if "git push" in text and PUSH_OK.search(output):
            actions["pushed"] = True
        if "gh pr create" in text:
            actions["pull_requests"] += PR_URL.findall(output)
        if "gh repo fork" in text:
            actions["forks"] += [u for u in REPO_URL.findall(output) if "/pull/" not in u]
        if re.search(r"gh search|gh api[^|;&]*search/", text):
            actions["github_searches"] += 1
        for match in GH_REPO_ARG.finditer(text):
            actions["repos_touched"].add(match.group(1) or match.group(2))
        if re.search(r"git config (--global )?user\.email ", text):
            actions["set_git_identity"] = True
        if "Logged in to github.com account" in output:
            actions["gh_logged_in"] = True
        if "Enter passphrase for" in output or "ssh-keygen -Y sign" in output:
            actions["signing_key_prompt"] = True
        # Claude tool input is JSON-encoded, so a quote after $TMPDIR arrives escaped.
        if re.search(r"\$TMPDIR(\\?\")?/tmp\.\*|/T/tmp\.\*", text):
            actions["sibling_run_dirs"] = True
    return actions


# ---------------------------------------------------------------------------
# Report sections


def heading(title):
    print()
    print("=" * 78)
    print(title)
    print("=" * 78)


def print_table(table, kinds=None):
    agents = list(next(iter(table.values())).keys()) if table else []
    print(f"  {'criterion':38} " + " ".join(f"{a:>9}" for a in agents))
    for cid, row in table.items():
        kind = f"[{kinds[cid]}]" if kinds else ""
        cells = " ".join(f"{f'{m}/{n}':>9}" for m, n in row.values())
        print(f"  {cid[:31]:31} {kind:7}{cells}")


def report_provenance(runs, excluded, scans):
    heading("Runs and models")
    counts = collections.Counter((r["format"], r["agent"]) for r in runs)
    for fmt in ("takehome", "comprehension", "algorithms", "perf"):
        line = ", ".join(f"{a} {counts[(fmt, a)]}" for a in AGENT_ORDER if counts[(fmt, a)])
        print(f"  {fmt:14} {sum(v for (f, _), v in counts.items() if f == fmt):4} runs ({line})")
    print(f"  total          {len(runs):4} runs analysed; {len(excluded)} excluded runs reported only as the incident")
    models = collections.defaultdict(set)
    for r in runs:
        models[r["agent"]].add((r["result"]["model"], r["result"].get("effort")))
    for agent in agents_in(runs):
        print(f"  {agent:7} model {', '.join(sorted(m for m, _ in models[agent]))}")
    errors = [r["name"] for r in runs if r["result"].get("is_error") or r["result"].get("timed_out")]
    print(f"  runs with is_error or timed_out: {len(errors)}")
    if scans:
        env = collections.Counter((r["format"], r["task"] == "feedme", scans[r["name"]]["environment"])
                                  for r in runs if r["name"] in scans)
        print("  where each run executed (from its transcript):")
        for (fmt, feedme, where), n in sorted(env.items()):
            label = "takehome/feedme" if feedme else fmt
            print(f"    {label:16} {where:9} {n}")


def report_takehome(runs, tasks_dir, hand_rows):
    heading("Take-home tasks")
    for task in sorted({r["task"] for r in runs if r["format"] == "takehome"}):
        task_runs = [r for r in runs if r["task"] == task]
        rubric = load_rubric(tasks_dir, "takehome", task)
        ids = [c["id"] for c in rubric["criteria"] if not (task == "feedme" and c["id"] in FEEDME_REQUIREMENTS)]
        kinds = {c["id"]: c["kind"] for c in rubric["criteria"]}
        table = criterion_table(runs, task, ids)
        print(f"\n-- {task}: pass rate per criterion (runs met / runs)")
        if task == "feedme":
            print("   requirements 1 to 6 are reported below over the runs that exercised them")
        if task == "existing-repo":
            print("   rubric criteria only; acceptance_passed is not quoted (it counts 9 results no criterion maps to)")
        print_table(table, kinds)
        print(f"   met by every agent in every run (no signal): {', '.join(met_by_all(table)) or 'none'}")
        print(f"   met by no agent in any run: {', '.join(met_by_none(table)) or 'none'}")
        mixed = mixed_cells(table)
        print(f"   agent x criterion cells where repeats disagree: {len(mixed)} of {len(ids) * len(agents_in(task_runs))}")
        for cid, agent in mixed:
            print(f"     {agent:7} {cid}")
        print("   criteria met per run, by agent (min / mean / max of", len(ids), "):")
        for agent in agents_in(task_runs):
            totals = [sum(r["labels"].get(c) == "met" for c in ids) for r in task_runs if r["agent"] == agent]
            print(f"     {agent:7} {min(totals)} / {statistics.fmean(totals):.1f} / {max(totals)}")
        if rubric.get("trap"):
            print(f"   trap {rubric['trap']['id']} (judge label per run):")
            for agent in agents_in(task_runs):
                outcomes = collections.Counter(r["trap"]["label"] for r in task_runs if r["agent"] == agent)
                print(f"     {agent:7} " + ", ".join(f"{k} {v}" for k, v in sorted(outcomes.items())))
        if task == "webhook-relay":
            print("   trap secret metrics (supporting evidence only, never an independent count):")
            for agent in agents_in(task_runs):
                mine = [r for r in task_runs if r["agent"] == agent]
                out = sum(r["score"]["metrics"].get("body_secret_in_output", 0) for r in mine)
                files = sum(r["score"]["metrics"].get("body_secret_in_files", 0) for r in mine)
                print(f"     {agent:7} secret in stdout/stderr {out}/{len(mine)}, in written files {files}/{len(mine)}")
        if task == "feedme":
            report_feedme(task_runs, rubric, hand_rows)


def report_feedme(task_runs, rubric, hand_rows):
    test_ids = {c["id"]: c["test_id"] for c in rubric["criteria"]}
    print("\n   FeedMe requirements, never violated where exercised (log parsed, requirement exercised):")
    print(f"     {'requirement':22} {'checker':>14} {'hand-graded':>14}")
    for cid in FEEDME_REQUIREMENTS:
        key = f"{test_ids[cid]}_exercised"
        counted = [r for r in task_runs if r["score"]["metrics"].get(key) == 1 and r["labels"].get("log-parsed") == "met"]
        checker = pct(sum(r["labels"][cid] == "met" for r in counted), len(counted))
        hand = pct(*exercised_rate(hand_rows, cid)) if hand_rows else "not graded"
        print(f"     {cid:22} {checker:>14} {hand:>14}")
    for agent in agents_in(task_runs):
        exercised = [sum(r["exercised"] for r in hand_rows if r["run"].split("__")[2] == agent and r["criterion"] == cid)
                     for cid in FEEDME_REQUIREMENTS]
        print(f"     runs exercising req1..req6, {agent:7} (hand): {exercised}")
    unparsed = [r["name"] for r in task_runs if r["score"]["metrics"].get("log_unparsed")]
    print(f"   runs with log_unparsed: {len(unparsed)} (graded by hand, never counted as failures)")
    for cid in ("req7-in-memory", "demonstrates-all", "honest-report"):
        rows = [r for r in hand_rows if r["criterion"] == cid]
        first_pass = "checker" if cid != "honest-report" else "judge"
        for agent in agents_in(task_runs):
            mine = [r for r in rows if r["run"].split("__")[2] == agent]
            print(f"   {cid:17} {agent:7} {first_pass} {pct(sum(r['judge'] == 'met' for r in mine), len(mine)):>11}"
                  f"  hand {pct(sum(r['hand'] == 'met' for r in mine), len(mine)):>11}")


def report_comprehension(runs, tasks_dir):
    heading("Comprehension (billing.ts, six planted bugs)")
    print("  Headline numbers are the judged *-explained criteria; *-located is a necessary condition only.")
    variants = sorted({r["task"] for r in runs if r["format"] == "comprehension"})
    bugs = None
    for task in variants:
        rubric = load_rubric(tasks_dir, "comprehension", task)
        bugs = [c["id"][: -len("-explained")] for c in rubric["criteria"] if c["id"].endswith("-explained")]
        explained = criterion_table(runs, task, [b + "-explained" for b in bugs])
        located = criterion_table(runs, task, [b + "-located" for b in bugs])
        other = criterion_table(runs, task, ["no-false-positives"])
        task_runs = [r for r in runs if r["task"] == task]
        print(f"\n-- {task}: bug explained (judge) and located (auto), runs out of runs")
        agents = agents_in(task_runs)
        print(f"  {'bug':28} " + " ".join(f"{a + ' expl':>11} {a + ' loc':>10}" for a in agents))
        for b in bugs:
            cells = " ".join(f"{'%d/%d' % explained[b + '-explained'][a]:>11} {'%d/%d' % located[b + '-located'][a]:>10}"
                             for a in agents)
            print(f"  {b:28} {cells}")
        print(f"  {'no-false-positives':28} " + " ".join(f"{'%d/%d' % other['no-false-positives'][a]:>11} {'':>10}" for a in agents))
        for agent in agents:
            per_run = [sum(r["labels"].get(b + "-explained") == "met" for b in bugs) for r in task_runs if r["agent"] == agent]
            print(f"  {agent:7} bugs explained per run: mean {statistics.fmean(per_run):.1f} of 6 (runs: {per_run})")
        for category in ("visible", "trace", "rule"):
            ids = [b + "-explained" for b in bugs if b.startswith(category)]
            met = sum(r["labels"].get(i) == "met" for r in task_runs for i in ids)
            print(f"  {category:8} bugs explained, all agents: {pct(met, len(ids) * len(task_runs))}")
        gaps = [(r["name"], b) for r in task_runs for b in bugs
                if r["labels"].get(b + "-explained") == "met" and r["labels"].get(b + "-located") != "met"]
        print(f"  explained but not located by the scorer: {len(gaps)}")
        for name, b in gaps:
            print(f"    {name} {b}")
        table = {**explained, **located, **other}
        print(f"  no signal (met by all agents in all runs): {', '.join(met_by_all(table)) or 'none'}")
        print(f"  met by no agent: {', '.join(met_by_none(table)) or 'none'}")
        mixed = mixed_cells(table)
        print(f"  cells where repeats disagree: {len(mixed)} of {len(table) * len(agents)}")
        if task.endswith("no-readme"):
            leaks = [(r["name"], b) for r in task_runs for b in bugs
                     if b.startswith("rule") and r["labels"].get(b + "-explained") == "met"]
            print(f"  README-only bugs explained without the README: {len(leaks)} of {len(task_runs) * 2}")
            for name, b in leaks:
                print(f"    {name} {b}")


def report_algorithms(runs, tasks_dir):
    heading("Algorithms (30 questions x 4 agents x 3 repeats)")
    algo = [r for r in runs if r["format"] == "algorithms"]
    agents = agents_in(algo)
    questions = sorted({r["task"] for r in algo})
    variant = {q: json.loads((pathlib.Path(tasks_dir) / "algorithms" / q / "meta.json").read_text())["variant"]
               for q in questions}
    passed = {(r["task"], r["agent"], r["rep"]): r["labels"]["all-cases"] == "met" for r in algo}
    overall = {}
    for agent in agents:
        mine = [v for (q, a, _), v in passed.items() if a == agent]
        overall[agent] = sum(mine) / len(mine)
        failures = sorted(f"{q} r{rep}" for (q, a, rep), v in passed.items() if a == agent and not v)
        print(f"  {agent:7} passed {sum(mine)}/{len(mine)} runs ({100 * overall[agent]:.1f}%); failed: {len(failures)}")
        for f in failures:
            print(f"           {f}")
    levels = sorted(set(overall.values()), reverse=True)
    order = " > ".join(" = ".join(a for a in agents if overall[a] == level) for level in levels)
    print(f"  measured overall order by pass rate: {order}")
    for group in ("known", "modified", "custom"):
        qs = [q for q in questions if variant[q] == group]
        line = ", ".join(f"{a} {pct(sum(passed[(q, a, rep)] for q in qs for rep in (1, 2, 3)), 3 * len(qs))}" for a in agents)
        print(f"  {group:8} questions ({len(qs)}): {line}")
    identical = identical_output_groups(algo)
    repeated = repeated_output_groups(algo)
    print(f"  agent x question groups with byte-identical solutions in all 3 repeats: {len(identical)};"
          f" in at least 2 of 3: {len(repeated)} (of {len(questions) * len(agents)})")
    for q, a in identical:
        print(f"    all 3 identical: {a:7} {q}")
    print("  so repeat agreement on those groups says nothing about run-to-run variance")
    print("\n  per question: passes out of 3 per agent, and Spearman rho against the overall order")
    print(f"  {'question':44} " + " ".join(f"{a:>7}" for a in agents) + "     rho")
    defined = []
    mixed = 0
    for q in questions:
        counts = [sum(passed[(q, a, rep)] for rep in (1, 2, 3)) for a in agents]
        mixed += sum(0 < c < 3 for c in counts)
        rho = spearman([c / 3 for c in counts], [overall[a] for a in agents])
        if rho is not None:
            defined.append((q, rho))
        rho_text = "undefined" if rho is None else f"{rho:+.2f}"
        print(f"  {q:44} " + " ".join(f"{c:>5}/3" for c in counts) + f"  {rho_text:>9}")
    all_pass = [q for q in questions if all(passed[(q, a, rep)] for a in agents for rep in (1, 2, 3))]
    print(f"  questions every agent passed in every run (no signal): {len(all_pass)} of {len(questions)}")
    no_pass = [q for q in questions if not any(passed[(q, a, rep)] for a in agents for rep in (1, 2, 3))]
    print(f"  questions no agent passed: {len(no_pass)}")
    print(f"  questions with a defined rho (some agent differs): {len(defined)}")
    for q, rho in defined:
        print(f"    {q}: rho {rho:+.2f}")
    print(f"  agent x question cells where repeats disagree: {mixed} of {len(questions) * len(agents)}")
    top = [a for a in agents if overall[a] == max(overall.values())]
    if len(top) > 1:
        print(f"  note: {', '.join(top)} tie at {100 * max(overall.values()):.0f}%, so no question can order them;"
              " rho only measures whether a question separates the weaker model(s) from the rest")


def report_perf(runs, tasks_dir, verdicts):
    heading("Performance take-home (simulated cycles, one run per agent)")
    perf = [r for r in runs if r["format"] == "perf"]
    for task in sorted({r["task"] for r in perf}):
        meta = json.loads((pathlib.Path(tasks_dir) / "perf" / task / "meta.json").read_text())
        baselines = meta["baselines"]
        start = baselines["starting_points"]["this_repo_start"]
        print(f"  starting kernel: {start} cycles; the 2-hour version Anthropic published numbers for started at "
              f"{baselines['starting_points']['two_hour_version_start']}")
        for entry in baselines["entries"]:
            print(f"  published: {entry['quote']}")
        for r in sorted((r for r in perf if r["task"] == task), key=lambda r: r["score"]["metrics"]["cycles"]):
            cycles = r["score"]["metrics"]["cycles"]
            beats = [str(e["cycles"]) for e in baselines["entries"] if cycles < e["cycles"]]
            behind = [str(e["cycles"]) for e in baselines["entries"] if cycles >= e["cycles"]]
            print(f"  {r['agent']}: {cycles} cycles ({r['result']['model']}), {start / cycles:.1f}x faster than the start;"
                  f" correct {r['labels'].get('correct')}, tests untouched {r['labels'].get('tests-untouched')}")
            print(f"      beats {', '.join(beats) or 'none'}; behind {', '.join(behind) or 'none'}")
            if r["name"] in verdicts:
                hand, reason = verdicts[r["name"]]
                print(f"      kernel read by hand: {hand}. {reason}")


def report_cost(runs, excluded):
    heading("Cost")
    for label, group in (("analysed runs", runs), ("excluded FeedMe runs (host isolation)", excluded)):
        print(f"  {label}:")
        by = collections.defaultdict(list)
        for r in group:
            by[(r["format"], r["agent"])].append(r["result"])
        for (fmt, agent), results in sorted(by.items(), key=lambda kv: (kv[0][0], AGENT_ORDER.index(kv[0][1]))):
            billed = [x["cost_usd"] for x in results if x.get("cost_usd") is not None]
            wall = [x["wall_s"] for x in results]
            cost = f"${sum(billed):.2f}" if billed else "no dollar cost recorded (subscription)"
            print(f"    {fmt:14} {agent:7} {len(results):3} runs  {cost:>40}  wall {sum(wall) / 60:.0f} min"
                  f" (median {statistics.median(wall):.0f} s)")
        total = sum(r["result"]["cost_usd"] for r in group if r["result"].get("cost_usd") is not None)
        feedme = sum(r["result"]["cost_usd"] for r in group if r["task"] == "feedme" and r["result"].get("cost_usd") is not None)
        print(f"    Claude agent spend (API-priced): ${total:.2f}, of which FeedMe ${feedme:.2f}")
    known_calls = sum(c for _, c, _ in JUDGE_BATCHES_KNOWN)
    known_cost = sum(d for _, _, d in JUDGE_BATCHES_KNOWN)
    rates = [d / c for _, c, d in JUDGE_BATCHES_KNOWN]
    pooled = known_cost / known_calls
    print("  judge (Opus, 3 votes per criterion; spend not stored per run):")
    for name, calls, dollars in JUDGE_BATCHES_KNOWN:
        print(f"    {name:22} {calls:5} calls  ${dollars:.2f} (exact, printed by judge.py)")
    print(f"    {'lost batch':22} {JUDGE_BATCH_LOST_CALLS:5} calls  summary lost; estimate ${pooled * JUDGE_BATCH_LOST_CALLS:.0f}"
          f" at the pooled ${pooled:.3f}/call (range ${min(rates) * JUDGE_BATCH_LOST_CALLS:.0f}-"
          f"${max(rates) * JUDGE_BATCH_LOST_CALLS:.0f} at the observed per-batch rates)")
    print(f"    judge total: ${known_cost:.2f} known exactly + about ${pooled * JUDGE_BATCH_LOST_CALLS:.0f} estimated"
          f" = about ${known_cost + pooled * JUDGE_BATCH_LOST_CALLS:.0f} over {known_calls + JUDGE_BATCH_LOST_CALLS} calls")
    print("    (the 1,485 calls of the full run include 270 spent on the 15 excluded FeedMe runs)")


def report_isolation(runs, scans):
    heading("Isolation audit (transcripts of the analysed runs)")
    missing = [r["name"] for r in runs if r["name"] not in scans]
    print(f"  transcripts scanned: {len(scans)}; missing: {len(missing)}")
    outside = {name: s for name, s in scans.items() if s["outside"]}
    inside_only = [name for name, s in scans.items() if s["inside"] and not s["outside"]]
    found = [name for name, s in scans.items() if s["found_instruction_file"]]
    print(f"  runs that referenced ~/.claude, ~/.codex, CLAUDE.md, AGENTS.md or credential paths only inside"
          f" their own directory: {len(inside_only)}")
    print(f"  runs with a reference outside their own directory: {len(outside)}")
    print(f"  runs whose output showed an instruction file actually present: {len(found)}")
    for name in found:
        print(f"    {name}: {scans[name]['found_lines']}")
    categories = collections.Counter(cat for s in outside.values() for cat, _, _ in s["outside"])
    print("  outside references by kind: " + ", ".join(f"{k} {v}" for k, v in sorted(categories.items())))
    for name, s in sorted(outside.items()):
        kinds = collections.Counter(cat for cat, _, _ in s["outside"])
        print(f"    {name:58} {', '.join(f'{k} x{v}' for k, v in sorted(kinds.items()))}")
    print("  what the outside references were:")
    print("    instruction-file: Codex searching the parent directory (find .. -name AGENTS.md); none found a file")
    print("    claude-session-dir: Claude Code reading its own spilled tool output or empty auto-memory for this run")
    for name, s in sorted(scans.items()):
        details = [f"{cat}: {text[:110]}" for cat, text, _ in s["outside"] if cat in ("credential-path", "codex-home", "claude-home")]
        for d in details:
            print(f"    {name}: {d}")
    print("  GitHub connector (Codex codex_apps) calls:")
    connectors = {name: s["connector_calls"] for name, s in scans.items() if s["connector_calls"]}
    if not connectors:
        print("    none")
    for name, calls in sorted(connectors.items()):
        print(f"    {name}: {len(calls)} calls, " + ", ".join(f"{k} x{v}" for k, v in sorted(collections.Counter(calls).items())))
        if scans[name]["connector_repos"]:
            print(f"      repositories opened by name: {', '.join(sorted(scans[name]['connector_repos']))}")
    searches = {name: s["web_searches"] for name, s in scans.items() if s["web_searches"]}
    print(f"  web searches: {sum(len(v) for v in searches.values())}")
    for name, qs in sorted(searches.items()):
        print(f"    {name}: {qs}")
    attached = {name: sorted(s["init_mcp_servers"]) for name, s in scans.items() if s["init_mcp_servers"]}
    print(f"  Claude sessions that started with MCP servers attached: {len(attached)}")
    for name, servers in sorted(attached.items()):
        print(f"    {name}: {', '.join(servers)} (no MCP tool was called)")


def report_fetches(runs):
    heading("External fetches recorded in result.json")
    kept_any = False
    gh_runs = []
    contaminated = []
    for r in runs:
        kept, gh = split_fetches(r["result"].get("external_fetches", []))
        if kept:
            kept_any = True
            print(f"  {r['name']}: {kept}")
        if gh:
            gh_runs.append((r["name"], gh))
        if r["result"].get("contamination"):
            contaminated.append((r["name"], r["result"]["contamination"]))
    if not kept_any:
        print("  none after dropping reserved, loopback and bare hosts")
    print(f"  runs that invoked gh: {len(gh_runs)}")
    for name, gh in gh_runs:
        print(f"    {name}: {gh}")
    print(f"  runs with contamination markers: {len(contaminated)}")
    for name, markers in contaminated:
        print(f"    {name}: {markers}")


def report_incident(excluded, transcripts_root, excluded_dir):
    heading("Excluded runs: the incidents (not analysed)")
    group = None
    for r in excluded:
        if r["dir"].parent.name != group:
            group = r["dir"].parent.name
            print(f"  -- {group}: {EXCLUDED_GROUPS.get(group, 'excluded')}")
        path = transcripts_root / r["dir"].relative_to(excluded_dir.parent) / "transcript.jsonl"
        if not path.exists():
            print(f"  {r['name']}: transcript missing")
            continue
        a = incident_actions(path)
        print(f"  {r['name']:30} pushed {'yes' if a['pushed'] else 'no':3}  PRs {a['pull_requests'] or '-'}"
              f"  forks {a['forks'] or '-'}")
        print(f"      web searches {len(a['web_searches'])}  GitHub searches {a['github_searches']}"
              f"  gh logged in {'yes' if a['gh_logged_in'] else 'no'}  signing-key prompt "
              f"{'yes' if a['signing_key_prompt'] else 'no'}  looked in other runs' temp dirs "
              f"{'yes' if a['sibling_run_dirs'] else 'no'}  set a git author identity "
              f"{'yes' if a['set_git_identity'] else 'no'}")
        others = sorted(x for x in a["repos_touched"] if not x.startswith(("feedmepos/", "iceinvein/")))
        if others:
            print(f"      other people's repositories read: {', '.join(others)}")
        for q in a["web_searches"]:
            print(f"      web search: {q}")


def load_handcheck(path, runs, feedme_runs):
    data = json.loads(pathlib.Path(path).read_text())
    rows = data["rows"]
    sample_rows = [r for r in rows if r["check"] == "sample"]
    drawn = draw_sample(runs, data["seed"], data["fraction"])
    recorded = sorted((r["run"], r["criterion"], r["judge"]) for r in sample_rows)
    if recorded != drawn:
        raise SystemExit("handcheck.json sample rows do not match the seeded draw over the current judge labels")
    feedme_rows = [r for r in rows if r["check"] == "feedme"]
    graded = {(r["run"], r["criterion"]) for r in feedme_rows}
    expected = {(r["name"], c) for r in feedme_runs for c in FEEDME_REQUIREMENTS + ["req7-in-memory", "demonstrates-all", "honest-report"]}
    if graded != expected:
        raise SystemExit(f"handcheck.json FeedMe rows cover {len(graded)} of {len(expected)} run x criterion pairs")
    for r in feedme_rows:
        run = next(x for x in feedme_runs if x["name"] == r["run"])
        if run["labels"][r["criterion"]] != r["judge"]:
            raise SystemExit(f"handcheck.json first-pass label for {r['run']} {r['criterion']} is stale")
    return data


def report_handcheck(data):
    heading("Hand-check (blind, by a fresh Claude agent, not a human)")
    rows = data["rows"]
    sample = [r for r in rows if r["check"] == "sample"]
    agree, n = agreement(sample)
    print(f"  seeded sample: seed {data['seed']}, fraction {data['fraction']}, {n} judged labels"
          " (criteria and traps) drawn from every judge.json")
    print(f"  judge vs hand agreement on the sample: {pct(agree, n)}")
    by_task = collections.defaultdict(list)
    for r in sample:
        by_task[r["run"].split("__")[1]].append(r)
    for task, task_rows in sorted(by_task.items()):
        print(f"    {task:22} {pct(*agreement(task_rows))}")
    not_met = [r for r in sample if r["judge"] != "met"]
    print(f"    rows the judge did not label met: {pct(*agreement(not_met))} agreement")
    for r in sample:
        if r["judge"] != r["hand"]:
            print(f"  disagreement: {r['run']} {r['criterion']}: judge {r['judge']}, hand {r['hand']}. {r['reason']}")
    feedme = [r for r in rows if r["check"] == "feedme"]
    auto = [r for r in feedme if r["criterion"] != "honest-report"]
    honest = [r for r in feedme if r["criterion"] == "honest-report"]
    print(f"  FeedMe, every run hand-graded: checker vs hand on requirement verdicts {pct(*agreement(auto))}")
    exercised_disagree = [r for r in feedme if "checker_exercised" in r and r["checker_exercised"] != r["exercised"]]
    print(f"    exercised flags where the hand grade differs from the checker: {len(exercised_disagree)}")
    for r in exercised_disagree:
        print(f"    {r['run']} {r['criterion']}: checker exercised {r['checker_exercised']}, hand {r['exercised']}. {r['reason']}")
    for r in auto:
        if r["judge"] != r["hand"]:
            print(f"    {r['run']} {r['criterion']}: checker {r['judge']}, hand {r['hand']}. {r['reason']}")
    print(f"  FeedMe honest-report, judge vs hand on all 15 runs: {pct(*agreement(honest))}")
    for r in honest:
        if r["judge"] != r["hand"]:
            print(f"    {r['run']}: judge {r['judge']}, hand {r['hand']}. {r['reason']}")


# ---------------------------------------------------------------------------


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--runs", type=pathlib.Path, default=REPO / "runs")
    parser.add_argument("--excluded", type=pathlib.Path, default=REPO / "runs-excluded")
    parser.add_argument("--tasks", type=pathlib.Path, default=REPO / "tasks")
    parser.add_argument("--handcheck", type=pathlib.Path, default=REPO / "handcheck.json")
    parser.add_argument("--transcripts", type=pathlib.Path)
    parser.add_argument("--seed", type=int, default=20260930, help="seed for drawing a new sample when no handcheck.json exists")
    args = parser.parse_args(argv)

    runs = load_runs(args.runs)
    excluded = [r for group in sorted(p for p in args.excluded.iterdir() if p.is_dir()) for r in load_runs(group)]
    feedme_runs = [r for r in runs if r["task"] == "feedme"]

    handcheck = None
    if args.handcheck.exists():
        handcheck = load_handcheck(args.handcheck, runs, feedme_runs)
    hand_rows = [r for r in handcheck["rows"] if r["check"] == "feedme"] if handcheck else []
    verdicts = {r["run"]: (r["hand"], r["reason"]) for r in handcheck["rows"] if r["check"] == "perf"} if handcheck else {}

    scans = {}
    if args.transcripts:
        for r in runs:
            path = args.transcripts / "runs" / r["name"] / "transcript.jsonl"
            if path.exists():
                scans[r["name"]] = scan_transcript(path)

    report_provenance(runs, excluded, scans)
    report_takehome(runs, args.tasks, hand_rows)
    report_comprehension(runs, args.tasks)
    report_algorithms(runs, args.tasks)
    report_perf(runs, args.tasks, verdicts)
    report_cost(runs, excluded)
    report_fetches(runs)
    if args.transcripts:
        report_isolation(runs, scans)
        report_incident(excluded, args.transcripts, args.excluded)
    else:
        heading("Isolation audit and incident report")
        print("  skipped: pass --transcripts <checkout holding the gitignored transcript.jsonl files>")
    if handcheck:
        report_handcheck(handcheck)
    else:
        heading("Hand-check")
        print(f"  {args.handcheck} not found; the seeded sample to label (seed {args.seed}, fraction {SAMPLE_FRACTION}) is:")
        for row in draw_sample(runs, args.seed, SAMPLE_FRACTION):
            print("   ", *row)


if __name__ == "__main__":
    sys.exit(main())
