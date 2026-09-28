#!/usr/bin/env bash
# Runs agents over tasks, one fresh session per run, and writes
#   runs/<format>__<id>__<agent>__r<rep>/{transcript.jsonl,stderr.txt,output/,final_message.txt,result.json}
#
#   ./run.sh --one <format> <id> <agent> <rep>   exactly one run
#   ./run.sh                                     every run selected by the env below
#
# Env: FORMATS, TASKS, AGENTS (space-separated filters), REPS (count per
# task and agent), JOBS (parallel runs, default 1), BUDGET (per-run USD cap
# for Claude agents), WALL_S (per-run wall-clock cap in seconds). Defaults for
# agents, reps and caps follow the plan's Ground Rules per format.
# A run whose result.json exists is skipped; delete it to re-run. A run in
# progress holds <run dir>.lock; one left by a crashed runner must be removed
# by hand.
set -euo pipefail

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
TASKS_DIR=${TASKS_DIR:-$REPO/tasks}
RUNS_DIR=${RUNS_DIR:-$REPO/runs}
ALL_FORMATS="takehome comprehension algorithms perf"

default_agents() {
  case "$1" in
    algorithms) echo "sonnet opus haiku codex" ;;
    takehome | comprehension | perf) echo "sonnet opus codex" ;;
    *) echo "unknown format: $1" >&2; return 1 ;;
  esac
}

default_reps() {
  case "$1" in
    takehome | comprehension) echo 5 ;;
    algorithms) echo 3 ;;
    perf) echo 1 ;;
    *) echo "unknown format: $1" >&2; return 1 ;;
  esac
}

default_budget() { if [[ "$1" == perf ]]; then echo 25.00; else echo 2.00; fi; }
default_wall_s() { if [[ "$1" == perf ]]; then echo 7200; else echo 1200; fi; }

# Codex reads instructions from CODEX_HOME, so each Codex session gets a
# scratch home holding credentials and a config that pins the operator's model
# and effort and lets the sandbox reach the network (to install packages, as
# Claude can), never the operator's AGENTS.md. Prints the directory; the
# caller removes it.
make_codex_home() {
  local auth="$HOME/.codex/auth.json" home
  [[ -f "$auth" ]] || { echo "missing Codex credentials: $auth" >&2; return 1; }
  home=$(mktemp -d)
  cp "$auth" "$home/auth.json"
  cat > "$home/config.toml" <<'TOML'
model = "gpt-6-sol"
model_reasoning_effort = "high"

[sandbox_workspace_write]
network_access = true
TOML
  echo "$home"
}

# Fills the named array with the agent's exact command line.
agent_command() {
  local -n into=$1
  local agent=$2 prompt=$3 budget=$4
  case "$agent" in
    sonnet | opus | haiku)
      into=(claude -p "$prompt" --model "$agent" --setting-sources project
        --output-format stream-json --verbose
        --allowedTools Read Write Edit Glob Grep Bash
        --disallowedTools WebSearch WebFetch Workflow RemoteTrigger SendMessage
        --permission-mode bypassPermissions --no-session-persistence
        --max-budget-usd "$budget") ;;
    codex)
      into=(codex exec --skip-git-repo-check --sandbox workspace-write --json "$prompt") ;;
    *) echo "unknown agent: $agent" >&2; return 1 ;;
  esac
}

agent_cli_version() {
  case "$1" in
    codex) codex --version ;;
    *) claude --version ;;
  esac
}

# run_timed <wall_s> <cwd> <stdout> <stderr> <status.json> <codex_home|""> -- <command...>
# Runs the command in its own session under an allowlisted environment and
# records exit code, wall time and whether the cap was hit. Whatever the
# agent started is killed when it exits, when the cap is hit, or when this
# runner is interrupted: the process group, plus descendants that left it
# with setsid, which a ps walk finds while their parent is still alive.
run_timed() {
  python3 - "$@" <<'PY'
import json, os, signal, subprocess, sys, time

wall_s, cwd, out_path, err_path, status_path, codex_home = sys.argv[1:7]
assert sys.argv[7] == "--"
command = sys.argv[8:]

# Anything else in the operator's shell (CLAUDE*, CODEX*, NODE_OPTIONS, ...)
# could change how a session behaves or what it can see.
env = {k: os.environ[k] for k in ("HOME", "PATH", "USER", "LANG", "TMPDIR") if k in os.environ}
env.update(TZ="UTC", PWD=cwd)
if codex_home:
    env["CODEX_HOME"] = codex_home


def process_table():
    """pid -> (ppid, start time); the start time tells a reused pid apart."""
    out = subprocess.run(["ps", "-A", "-o", "pid=,ppid=,lstart="],
                         capture_output=True, text=True, check=True).stdout
    table = {}
    for line in out.splitlines():
        pid, ppid, started = line.split(None, 2)
        table[int(pid)] = (int(ppid), started)
    return table


def descendants(root, table):
    children = {}
    for pid, (ppid, started) in table.items():
        children.setdefault(ppid, []).append((pid, started))
    found, frontier = {}, [root]
    while frontier:
        for pid, started in children.get(frontier.pop(), []):
            if pid not in found:
                found[pid] = started
                frontier.append(pid)
    return found


proc = None
known = {}


def kill_all(sig):
    if proc is None:
        return
    try:
        os.killpg(proc.pid, sig)
    except ProcessLookupError:
        pass
    table = process_table()
    for pid, started in {**known, **descendants(proc.pid, table)}.items():
        if table.get(pid, (None, None))[1] == started:
            try:
                os.kill(pid, sig)
            except ProcessLookupError:
                pass


def on_signal(signum, frame):
    kill_all(signal.SIGKILL)
    sys.exit(128 + signum)


for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
    signal.signal(sig, on_signal)

start = time.monotonic()
deadline = start + float(wall_s)
timed_out = False
code = None
with open(out_path, "wb") as out, open(err_path, "wb") as err:
    proc = subprocess.Popen(command, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
                            stdout=out, stderr=err, start_new_session=True)
    while True:
        known.update(descendants(proc.pid, process_table()))
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            timed_out = True
            break
        try:
            code = proc.wait(timeout=min(1.0, remaining))
            break
        except subprocess.TimeoutExpired:
            pass
    if timed_out:
        kill_all(signal.SIGTERM)
        try:
            code = proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            pass
    # Also after a clean exit: a background child of the agent would
    # otherwise keep writing to the workspace while it is copied.
    kill_all(signal.SIGKILL)
    if code is None:
        code = proc.wait()
with open(status_path, "w") as f:
    json.dump({"exit_code": code, "timed_out": timed_out,
               "wall_s": round(time.monotonic() - start, 3)}, f)
PY
}

# summarise <agent> <format> <transcript> <status.json> <codex_home|""> <final_message.txt>
# Prints JSON with the per-agent fields of result.json and writes the agent's
# final message. A value the agent did not report is null, never guessed.
summarise() {
  python3 - "$REPO" "$@" <<'PY'
import glob, json, os, re, sys, urllib.parse

repo, agent, fmt, transcript, status_path, codex_home, final_path = sys.argv[1:8]
status = json.load(open(status_path))
raw = open(transcript, errors="replace").read()
events = []
for line in raw.splitlines():
    line = line.strip()
    if line.startswith("{"):
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            pass  # a run killed at the wall-clock cap can end mid-line.


def strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for v in value.values():
            yield from strings(v)
    elif isinstance(value, list):
        for v in value:
            yield from strings(v)


failed_run = status["exit_code"] != 0 or status["timed_out"]
if agent == "codex":
    turns = [e for e in events if e.get("type") == "turn.completed"]
    errored = any(e.get("type") in ("turn.failed", "error") for e in events)
    items = [e["item"] for e in events if e.get("type") == "item.completed" and "item" in e]
    usage = None
    for e in turns:
        usage = usage or {}
        for k, v in e.get("usage", {}).items():
            usage[k] = usage.get(k, 0) + v
    # codex exec --json reports neither model nor effort; the session rollout
    # does. A session killed mid-write can leave a cut-off last line.
    model = effort = None
    for path in sorted(glob.glob(os.path.join(codex_home, "sessions", "**", "rollout-*.jsonl"), recursive=True)):
        for line in open(path, errors="replace"):
            try:
                e = json.loads(line)
            except json.JSONDecodeError:
                continue
            if e.get("type") == "turn_context":
                model = e["payload"].get("model", model)
                effort = e["payload"].get("effort", effort)
    messages = [i["text"] for i in items if i.get("type") == "agent_message"]
    commands = [i["command"] for i in items if i.get("type") == "command_execution"]
    final = messages[-1] if messages else None
    # One codex exec is one turn in Codex's own count, so turns is 1 for any
    # completed run; codex_steps (commands run plus messages sent) is the
    # closer measure of how much work the session did.
    fields = {"model": model, "effort": effort,
              "is_error": failed_run or errored or not turns,
              "cost_usd": None, "turns": len(turns) if turns else None,
              "codex_steps": sum(1 for i in items if i.get("type") in ("command_execution", "agent_message")),
              "usage": usage}
else:
    init = next((e for e in events if e.get("type") == "system" and e.get("subtype") == "init"), {})
    result = next((e for e in reversed(events) if e.get("type") == "result"), None)
    commands = [c["input"]["command"] for e in events if e.get("type") == "assistant"
                for c in e.get("message", {}).get("content", [])
                if c.get("type") == "tool_use" and c.get("name") == "Bash" and "command" in c.get("input", {})]
    final = result.get("result") if result else None
    fields = {"model": init.get("model"), "effort": None,
              "is_error": failed_run or result is None or bool(result.get("is_error")),
              "cost_usd": result.get("total_cost_usd") if result else None,
              "turns": result.get("num_turns") if result else None,
              "codex_steps": None,
              "usage": result.get("usage") if result else None}

# Signs the agent went looking for the answers instead of doing the task.
said = raw + "\n" + "\n".join(s for e in events for s in strings(e))
fields["contamination"] = [m for m in (repo, "hidden/", "reference/", "rubric.json") if m in said]

allowed_hosts = {"registry.npmjs.org", "pypi.org", "files.pythonhosted.org"}
if fmt == "perf":
    allowed_hosts.add("github.com")
fetches = []
for command in commands:
    if not re.search(r"\b(curl|wget|fetch)\b", command):
        continue
    for url in re.findall(r"https?://[^\s'\"<>()\\;&|`]+", command):
        if urllib.parse.urlparse(url).hostname not in allowed_hosts and url not in fetches:
            fetches.append(url)
fields["external_fetches"] = fetches

if final is not None:
    with open(final_path, "w") as f:
        f.write(final)
fields.update(timed_out=status["timed_out"], exit_code=status["exit_code"], wall_s=status["wall_s"])
print(json.dumps(fields))
PY
}

# perf_tree snapshot <work> <snapshot.json>
# perf_tree collect <work> <snapshot.json> <run_config.json> <output dir>
# The perf task's upstream repo has no licence, so output/ keeps only what the
# candidate wrote: the task's kept files plus new files outside its protected
# paths. Every change to the upstream, protected or not, goes into
# output/.upstream_changes.json so scoring can see tampering it cannot copy.
perf_tree() {
  python3 - "$@" <<'PY'
import hashlib, json, pathlib, shutil, sys

SKIPPED = {".git", "node_modules", "__pycache__"}


def tree(root):
    return {
        path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(root.rglob("*"))
        if path.is_file() and not SKIPPED & set(path.relative_to(root).parts)
    }


mode, work, snapshot = sys.argv[1], pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3])
if mode == "snapshot":
    snapshot.write_text(json.dumps(tree(work)))
    sys.exit(0)
assert mode == "collect", mode
config = json.loads(pathlib.Path(sys.argv[4]).read_text())
kept, protected_paths = config["kept_files"], config["protected_paths"]
out = pathlib.Path(sys.argv[5])
before, after = json.loads(snapshot.read_text()), tree(work)


def protected(rel):
    return any(rel.startswith(p) if p.endswith("/") else rel == p for p in protected_paths)


changes = {
    "modified": sorted(p for p in before if p in after and after[p] != before[p]),
    "added": sorted(p for p in after if p not in before),
    "deleted": sorted(p for p in before if p not in after),
}
out.mkdir(parents=True)
for rel in sorted(set(kept) & set(after)) + [p for p in changes["added"] if not protected(p)]:
    (out / rel).parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(work / rel, out / rel)
(out / ".upstream_changes.json").write_text(json.dumps(changes, indent=2) + "\n")
PY
}

CLEANUP=()
cleanup() { rm -rf "${CLEANUP[@]}"; }

run_one() {
  local format=$1 id=$2 agent=$3 rep=$4
  local task="$TASKS_DIR/$format/$id"
  local dir="$RUNS_DIR/${format}__${id}__${agent}__r${rep}"
  [[ -d "$task" ]] || { echo "no such task: $task" >&2; return 1; }

  # Temp dirs, the Codex credential copy and the lock go however the run
  # ends; an interrupted run stops before writing result.json.
  trap cleanup EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
  mkdir -p "$RUNS_DIR"
  if ! mkdir "$dir.lock" 2>/dev/null; then
    echo "locked: $dir.lock (another runner has this run, or one crashed and left it)" >&2
    return 1
  fi
  CLEANUP+=("$dir.lock")

  if [[ -f "$dir/result.json" ]]; then
    echo "skip $(basename "$dir")"
    return 0
  fi
  # A directory without result.json is a run that died part way; start over.
  rm -rf "$dir"
  mkdir -p "$dir"

  local budget=${BUDGET:-$(default_budget "$format")}
  local wall_s=${WALL_S:-$(default_wall_s "$format")}
  local work codex_home=""
  work=$(mktemp -d)
  CLEANUP+=("$work" "$work.status.json" "$work.snapshot.json")
  if [[ "$format" == perf ]]; then
    "$task/fetch.sh" "$work"
    perf_tree snapshot "$work" "$work.snapshot.json"
  else
    cp -R "$task/workspace/." "$work/"
  fi

  local -a command_line
  agent_command command_line "$agent" "$(cat "$task/prompt.md")" "$budget"
  local cli
  cli=$(agent_cli_version "$agent")
  if [[ "$agent" == codex ]]; then
    codex_home=$(make_codex_home)
    CLEANUP+=("$codex_home")
  fi

  echo "run  $(basename "$dir")"
  run_timed "$wall_s" "$work" "$dir/transcript.jsonl" "$dir/stderr.txt" "$work.status.json" "$codex_home" -- "${command_line[@]}"

  # Agents sometimes git init their workspace; a nested .git cannot be
  # committed under runs/, and dependencies and bytecode are rebuilt when scoring.
  if [[ "$format" == perf ]]; then
    perf_tree collect "$work" "$work.snapshot.json" "$task/run_config.json" "$dir/output"
  else
    rsync -a --exclude node_modules --exclude .git --exclude __pycache__ "$work/" "$dir/output/"
  fi

  local fields
  fields=$(summarise "$agent" "$format" "$dir/transcript.jsonl" "$work.status.json" "$codex_home" "$dir/final_message.txt")
  # Written aside and renamed, so a result.json that exists is always whole.
  python3 - "$dir/result.json" "$format" "$id" "$agent" "$rep" "$cli" "$fields" <<'PY'
import json, os, sys
path, fmt, task, agent, rep, cli, fields = sys.argv[1:8]
result = {"format": fmt, "task": task, "agent": agent, "rep": int(rep), "cli": cli}
result.update(json.loads(fields))
with open(path + ".tmp", "w") as f:
    json.dump(result, f, indent=2)
    f.write("\n")
os.replace(path + ".tmp", path)
PY
}

run_all() {
  local format id agent rep list=""
  for format in ${FORMATS:-$ALL_FORMATS}; do
    [[ -d "$TASKS_DIR/$format" ]] || { echo "no tasks for format: $format" >&2; return 1; }
    local ids=${TASKS:-$(ls "$TASKS_DIR/$format")}
    for id in $ids; do
      [[ -d "$TASKS_DIR/$format/$id" ]] || continue
      for agent in ${AGENTS:-$(default_agents "$format")}; do
        for rep in $(seq 1 "${REPS:-$(default_reps "$format")}"); do
          list+="$format $id $agent $rep"$'\n'
        done
      done
    done
  done
  [[ -n "$list" ]] || { echo "no runs selected" >&2; return 1; }
  printf '%s' "$list" | xargs -P "${JOBS:-1}" -n 4 "$REPO/run.sh" --one
}

main() {
  if [[ "${1:-}" == --one ]]; then
    [[ $# -eq 5 ]] || { echo "usage: $0 --one <format> <id> <agent> <rep>" >&2; return 2; }
    run_one "$2" "$3" "$4" "$5"
  elif [[ $# -eq 0 ]]; then
    run_all
  else
    echo "usage: $0 [--one <format> <id> <agent> <rep>]" >&2
    return 2
  fi
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
