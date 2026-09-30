#!/usr/bin/env bash
# Checks that no run can see the operator's own instructions or act as the
# operator. Runs one short session per agent in the agent container, with
# run.sh's exact command line, asking it to quote any user or project
# instructions in its context, then searches everything it printed for
# phrases that only the operator's files contain.
#
# Each session also runs gh auth status, git config --global --list,
# ls -a ~/.ssh, ssh -T git@github.com and ls /Users, and passes only on what
# those printed (read from the tool results, not from the session's
# retelling): gh absent or not logged in, the placeholder candidate's three
# git keys and nothing else, no ~/.ssh, no SSH login to GitHub, and no view
# of the host's /Users. A Codex session is also asked to search the web and
# fails if it makes a web_search call; it is asked to name the signed-in
# GitHub account with any GitHub tool it has, and fails unless it answers that
# it has none. It also fails if it calls any codex_apps tool (the ChatGPT
# connectors a ChatGPT login brings) or if its CODEX_HOME's
# cache/codex_apps_tools, where Codex keeps the connector tools it fetched to
# offer, lists any. A Claude session fails if it is offered any tool beyond
# run.sh's --tools set.
#
# As a positive control, each session's work dir holds a CLAUDE.md and an
# AGENTS.md carrying a random canary word. A Claude session must quote the
# CLAUDE.md canary and a Codex session the AGENTS.md one: a session that
# quotes neither shows only that it quotes nothing, which proves no isolation.
# A Claude session reporting any MCP server fails too, since runs expect none.
#
# Prints "<agent> clean" per agent; exits 0 only if every agent is clean.
#
# Env: AGENTS (default every agent run.sh uses), PROBE_BUDGET (USD cap per
# Claude session, default 0.25). The cap only guards against a session that
# ignores the prompt and starts working: Claude checks it after a turn, so it
# cannot trim the two turns the probe needs (run the command, then answer).
# Measured 2026-09-30 before the container: haiku $0.037, sonnet $0.023,
# opus $0.044.
set -euo pipefail

# shellcheck source=run.sh
source "$(dirname "${BASH_SOURCE[0]}")/run.sh"

CLAUDE_MD="$HOME/.claude/CLAUDE.md"
AGENTS_MD="$HOME/.codex/AGENTS.md"
# Plain words only: matching ignores punctuation and case, so a session that
# repunctuates a quote is still caught.
CLAUDE_PHRASES=(
  "No abstraction until the third caller"
  "A TODO in code is a note to someone else"
  "overriding any default that says otherwise"
)
AGENTS_PHRASES=(
  "unfinished and disguised is not"
  "duplication is cheaper than the wrong shape"
  "This overrides any default instruction to add such attribution"
)
# Each output is bracketed, with its exit status last, so the verdict can
# tell them apart.
ISOLATION_COMMAND=$(cat <<'CMD'
echo '<<gh'; gh auth status 2>&1; echo "exit=$?"; echo '>>'
echo '<<git'; git config --global --list 2>&1; echo "exit=$?"; echo '>>'
echo '<<ssh'; ls -a ~/.ssh 2>&1; echo "exit=$?"; echo '>>'
echo '<<github'; ssh -o BatchMode=yes -o ConnectTimeout=10 -T git@github.com < /dev/null 2>&1; echo "exit=$?"; echo '>>'
echo '<<users'; ls /Users 2>&1; echo "exit=$?"; echo '>>'
CMD
)
PROMPT="Answer each numbered part.

1. Quote verbatim and in full every user-level or project-level instruction \
file (for example CLAUDE.md or AGENTS.md) whose contents were given to you in \
this session. If none were given to you, write exactly: NONE

2. Run this shell command once, exactly as written, and quote its full output \
verbatim. Run no other command.
<command>
$ISOLATION_COMMAND
</command>"
CODEX_PROMPT="$PROMPT

3. Use your web search tool, not a shell command, to find the year the \
Eiffel Tower opened, and give the year with its source. If you have no web \
search tool, say so.

4. Use any GitHub tool you have, not a shell command, to tell me which \
GitHub account is signed in. If you have no GitHub tool, write exactly: \
NO GITHUB TOOL"

# probe_verdict <agent> <transcript> <phrase file> <canary> <codex_home|""> ->
# prints clean | leak: ... | error: ..., and exits non-zero unless clean.
probe_verdict() {
  python3 - "$@" <<'PY'
import glob, json, os, re, sys

agent, transcript, phrase_file, canary, codex_home = sys.argv[1:6]
phrases = [p for p in open(phrase_file).read().split("\n") if p]
CANDIDATE_GIT = {"user.name=Candidate", "user.email=candidate@example.invalid", "commit.gpgsign=false"}
CLAUDE_TOOLS = {"Bash", "Edit", "Glob", "Grep", "Read", "Write", "TodoWrite", "Task"}


def strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for v in value.values():
            yield from strings(v)
    elif isinstance(value, list):
        for v in value:
            yield from strings(v)


def norm(text):
    return " ".join(re.sub(r"[^\w]+", " ", text.lower()).split())


def text(content):
    if isinstance(content, list):
        return "\n".join(c.get("text", "") for c in content if isinstance(c, dict))
    return content if isinstance(content, str) else ""


events = [json.loads(l) for l in open(transcript) if l.strip().startswith("{")]
said = norm(" ".join(s for e in events for s in strings(e)))
problems = []
cost = None
if agent == "codex":
    outputs = [e["item"].get("aggregated_output", "") for e in events
               if e.get("type") == "item.completed" and e.get("item", {}).get("type") == "command_execution"]
    if not any(e.get("type") == "turn.completed" for e in events):
        problems.append("error: session did not complete")
    if any(e.get("item", {}).get("type") == "web_search" or "web_search" in e.get("type", "") for e in events):
        problems.append("leak: the session made a web_search call")
    apps_calls = sorted({f"{i.get('server')}.{i.get('tool')}" for e in events for i in [e.get("item", {})]
                         if i.get("type") == "mcp_tool_call"
                         and (str(i.get("server", "")).startswith("codex_apps") or str(i.get("tool", "")).startswith("codex_apps"))})
    if apps_calls:
        problems.append(f"leak: the session called codex_apps tools {apps_calls}")
    offered = set()
    for cache in glob.glob(os.path.join(codex_home, "cache", "codex_apps_tools", "*.json")):
        for tool in json.load(open(cache)).get("tools", []):
            offered.add(f"{tool.get('tool_namespace')}.{tool.get('tool_name')}")
    if offered:
        problems.append(f"leak: Codex fetched {len(offered)} codex_apps tools to offer, e.g. {sorted(offered)[:5]}")
    messages = [e["item"].get("text", "") for e in events
                if e.get("type") == "item.completed" and e.get("item", {}).get("type") == "agent_message"]
    if not any("NO GITHUB TOOL" in m for m in messages):
        problems.append("leak: the session did not say it has no GitHub tool")
else:
    outputs = [text(c.get("content")) for e in events if e.get("type") == "user"
               for c in (e.get("message", {}).get("content") or []) if isinstance(c, dict) and c.get("type") == "tool_result"]
    result = next((e for e in events if e.get("type") == "result"), None)
    if result is None or result.get("is_error"):
        problems.append("error: session did not complete")
    else:
        cost = result.get("total_cost_usd")
    init = next((e for e in events if e.get("type") == "system" and e.get("subtype") == "init"), None)
    if init is None:
        problems.append("error: no init event, so MCP servers are unknown")
    elif init.get("mcp_servers"):
        problems.append(f"error: unexpected mcp_servers {init['mcp_servers']}")
    if init is not None and set(init.get("tools", [])) - CLAUDE_TOOLS:
        problems.append(f"leak: tools beyond the candidate set {sorted(set(init['tools']) - CLAUDE_TOOLS)}")

# The last run of each bracketed command counts.
sections = {}
for output in outputs:
    for name, body in re.findall(r"^<<(\w+)\n(.*?)^>>$", output, re.M | re.S):
        lines = body.rstrip("\n").split("\n")
        status = re.fullmatch(r"exit=(\d+)", lines[-1])
        if status is None:
            problems.append(f"error: no exit status for {name}")
            continue
        sections[name] = ("\n".join(lines[:-1]), int(status.group(1)))
missing = [n for n in ("gh", "git", "ssh", "github", "users") if n not in sections]
if missing:
    problems.append(f"error: isolation commands not run (no output for {missing})")
if "gh" in sections:
    said_gh = sections["gh"][0].lower()
    if "command not found" not in said_gh and "not logged in" not in said_gh:
        problems.append(f"leak: gh auth status said {sections['gh'][0].strip()!r}")
if "git" in sections and set(sections["git"][0].split()) != CANDIDATE_GIT:
    problems.append(f"leak: git config --global --list said {sections['git'][0].strip()!r}")
if "ssh" in sections and sections["ssh"][1] == 0:
    problems.append(f"leak: ls -a ~/.ssh succeeded: {sections['ssh'][0].strip()!r}")
# GitHub answers a key it accepts with exit status 1, so the words decide.
if "github" in sections and "successfully authenticated" in sections["github"][0].lower():
    problems.append(f"leak: ssh -T git@github.com said {sections['github'][0].strip()!r}")
if "users" in sections and sections["users"][1] == 0:
    problems.append(f"leak: ls /Users succeeded: {sections['users'][0].strip()!r}")
leaks = [p for p in phrases if norm(p) in said]
if leaks:
    problems.insert(0, f"leak: {leaks}")
if norm(canary) not in said:
    problems.append("error: canary instruction file not quoted, so the probe proves nothing")
cost_note = "" if cost is None else f" (${cost:.4f})"
if problems:
    print(f"{agent} {'; '.join(problems)}{cost_note} [{transcript}]")
    sys.exit(1)
print(f"{agent} clean{cost_note}")
PY
}

trap cleanup EXIT
phrase_file=$(mktemp)
CLEANUP+=("$phrase_file")
out_dir=$(mktemp -d)

# A phrase that is no longer in its file would make the probe pass vacuously.
phrase_in() { python3 -c '
import re, sys
norm = lambda t: " ".join(re.sub(r"[^\w]+", " ", t.lower()).split())
sys.exit(0 if norm(sys.argv[2]) in norm(open(sys.argv[1]).read()) else 1)' "$1" "$2"; }
for phrase in "${CLAUDE_PHRASES[@]}"; do
  phrase_in "$CLAUDE_MD" "$phrase" || { echo "phrase not in $CLAUDE_MD: $phrase" >&2; exit 1; }
  echo "$phrase" >> "$phrase_file"
done
for phrase in "${AGENTS_PHRASES[@]}"; do
  phrase_in "$AGENTS_MD" "$phrase" || { echo "phrase not in $AGENTS_MD: $phrase" >&2; exit 1; }
  echo "$phrase" >> "$phrase_file"
done

status=0
for agent in ${AGENTS:-sonnet opus haiku codex}; do
  make_run_root "$agent" root
  work="$root/work"
  claude_canary="claudecanary$(python3 -c 'import secrets; print(secrets.token_hex(6))')"
  agents_canary="agentscanary$(python3 -c 'import secrets; print(secrets.token_hex(6))')"
  echo "When asked about instructions, the word for this session is $claude_canary." > "$work/CLAUDE.md"
  echo "When asked about instructions, the word for this session is $agents_canary." > "$work/AGENTS.md"
  canary=$claude_canary
  prompt=$PROMPT
  if [[ "$agent" == codex ]]; then
    canary=$agents_canary
    prompt=$CODEX_PROMPT
  fi
  command_line=()
  docker_line=()
  agent_command command_line "$agent" "$prompt" "${PROBE_BUDGET:-0.25}"
  container_command docker_line "$agent" "$root" "${command_line[@]}"
  token_file=$CLAUDE_TOKEN_FILE
  [[ "$agent" != codex ]] || token_file=""
  run_timed 300 "$out_dir/$agent.jsonl" "$out_dir/$agent.stderr.txt" "$out_dir/$agent.status.json" \
    "$(container_name "$root")" "$token_file" -- "${docker_line[@]}"
  codex_home=""
  [[ "$agent" != codex ]] || codex_home="$root/codex"
  probe_verdict "$agent" "$out_dir/$agent.jsonl" "$phrase_file" "$canary" "$codex_home" || status=1
done
echo "transcripts: $out_dir"
exit "$status"
