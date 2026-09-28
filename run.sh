#!/usr/bin/env bash
# Runs agents over tasks, one fresh session per run, and writes
#   runs/<format>__<id>__<agent>__r<rep>/{transcript.jsonl,stderr.txt,output/,result.json}
#
#   ./run.sh --one <format> <id> <agent> <rep>   exactly one run
#   ./run.sh                                     every run selected by the env below
#
# Env: FORMATS, TASKS, AGENTS (space-separated filters), REPS (count per
# task and agent), JOBS (parallel runs, default 1), BUDGET (per-run USD cap
# for Claude agents), WALL_S (per-run wall-clock cap in seconds). Defaults for
# agents, reps and caps follow the plan's Ground Rules per format.
# A run whose result.json exists is skipped; delete it to re-run.
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
# scratch home holding credentials and an empty config, never the operator's
# AGENTS.md. Prints the directory; the caller removes it.
make_codex_home() {
  local auth="$HOME/.codex/auth.json" home
  [[ -f "$auth" ]] || { echo "missing Codex credentials: $auth" >&2; return 1; }
  home=$(mktemp -d)
  cp "$auth" "$home/auth.json"
  : > "$home/config.toml"
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

# run_timed <wall_s> <cwd> <stdout> <stderr> <status.json> -- <command...>
# Runs the command in its own process group so a timeout kills everything it
# spawned, not just the top process, and records exit code, wall time and
# whether the cap was hit.
run_timed() {
  python3 - "$@" <<'PY'
import json, os, signal, subprocess, sys, time

wall_s, cwd, out_path, err_path, status_path = sys.argv[1:6]
assert sys.argv[6] == "--"
command = sys.argv[7:]
start = time.monotonic()
timed_out = False
with open(out_path, "wb") as out, open(err_path, "wb") as err:
    proc = subprocess.Popen(command, cwd=cwd, stdin=subprocess.DEVNULL,
                            stdout=out, stderr=err, start_new_session=True)
    try:
        code = proc.wait(timeout=float(wall_s))
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(proc.pid, signal.SIGTERM)
        try:
            code = proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            code = proc.wait()
with open(status_path, "w") as f:
    json.dump({"exit_code": code, "timed_out": timed_out,
               "wall_s": round(time.monotonic() - start, 3)}, f)
PY
}

# summarise <agent> <transcript> <status.json> <codex_home|""> -> prints JSON
# with the per-agent fields of result.json. A value the agent did not report
# is null, never guessed.
summarise() {
  python3 - "$@" <<'PY'
import glob, json, os, sys

agent, transcript, status_path, codex_home = sys.argv[1:5]
status = json.load(open(status_path))
events = []
with open(transcript) as f:
    for line in f:
        line = line.strip()
        if line.startswith("{"):
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                pass  # a run killed at the wall-clock cap can end mid-line.

failed_run = status["exit_code"] != 0 or status["timed_out"]
if agent == "codex":
    turns = [e for e in events if e.get("type") == "turn.completed"]
    errored = any(e.get("type") in ("turn.failed", "error") for e in events)
    usage = None
    for e in turns:
        usage = usage or {}
        for k, v in e.get("usage", {}).items():
            usage[k] = usage.get(k, 0) + v
    # codex exec --json does not report the model; its session rollout does.
    model = None
    for path in sorted(glob.glob(os.path.join(codex_home, "sessions", "**", "rollout-*.jsonl"), recursive=True)):
        for line in open(path):
            e = json.loads(line)
            if e.get("type") == "turn_context":
                model = e["payload"].get("model", model)
    fields = {"model": model, "is_error": failed_run or errored or not turns,
              "cost_usd": None, "turns": len(turns) if turns else None, "usage": usage}
else:
    init = next((e for e in events if e.get("type") == "system" and e.get("subtype") == "init"), {})
    result = next((e for e in reversed(events) if e.get("type") == "result"), None)
    fields = {"model": init.get("model"),
              "is_error": failed_run or result is None or bool(result.get("is_error")),
              "cost_usd": result.get("total_cost_usd") if result else None,
              "turns": result.get("num_turns") if result else None,
              "usage": result.get("usage") if result else None}
fields.update(timed_out=status["timed_out"], exit_code=status["exit_code"], wall_s=status["wall_s"])
print(json.dumps(fields))
PY
}

# The perf task's upstream repo has no licence, so output/ keeps only what the
# candidate wrote: the kernel file they are asked to edit, plus files that did
# not exist after fetching, minus the upstream's tests/ and problem.py.
copy_perf_output() {
  python3 - "$@" <<'PY'
import pathlib, shutil, sys

work, fetched_list, out = map(pathlib.Path, sys.argv[1:4])
fetched = set(fetched_list.read_text().split("\n"))
out.mkdir(parents=True)
for path in sorted(work.rglob("*")):
    rel = path.relative_to(work)
    if not path.is_file() or {".git", "node_modules"} & set(rel.parts):
        continue
    if rel.parts[0] in ("tests", "problem.py"):
        continue
    if str(rel) != "perf_takehome.py" and f"./{rel}" in fetched:
        continue
    (out / rel).parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, out / rel)
PY
}

run_one() {
  local format=$1 id=$2 agent=$3 rep=$4
  local task="$TASKS_DIR/$format/$id"
  local dir="$RUNS_DIR/${format}__${id}__${agent}__r${rep}"
  [[ -d "$task" ]] || { echo "no such task: $task" >&2; return 1; }
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
  # The Codex home holds a copy of the operator's credentials, so it goes
  # even when a step below fails and set -e ends the run.
  trap "rm -rf '$work' '$work.status.json' '$work.fetched'" EXIT
  if [[ "$format" == perf ]]; then
    "$task/fetch.sh" "$work"
    (cd "$work" && find . -type f -not -path './.git/*' | sort) > "$work.fetched"
  else
    cp -R "$task/workspace/." "$work/"
  fi

  local -a command_line
  agent_command command_line "$agent" "$(cat "$task/prompt.md")" "$budget"
  local cli
  cli=$(agent_cli_version "$agent")
  if [[ "$agent" == codex ]]; then
    codex_home=$(make_codex_home)
    trap "rm -rf '$work' '$work.status.json' '$work.fetched' '$codex_home'" EXIT
  fi

  echo "run  $(basename "$dir")"
  (
    export TZ=UTC
    [[ -z "$codex_home" ]] || export CODEX_HOME="$codex_home"
    run_timed "$wall_s" "$work" "$dir/transcript.jsonl" "$dir/stderr.txt" "$work.status.json" -- "${command_line[@]}"
  )

  # Agents sometimes git init their workspace; a nested .git cannot be
  # committed under runs/, and dependencies are reinstalled when scoring.
  if [[ "$format" == perf ]]; then
    copy_perf_output "$work" "$work.fetched" "$dir/output"
  else
    rsync -a --exclude node_modules --exclude .git "$work/" "$dir/output/"
  fi

  local fields
  fields=$(summarise "$agent" "$dir/transcript.jsonl" "$work.status.json" "$codex_home")
  python3 - "$dir/result.json" "$format" "$id" "$agent" "$rep" "$cli" "$fields" <<'PY'
import json, sys
path, fmt, task, agent, rep, cli, fields = sys.argv[1:8]
result = {"format": fmt, "task": task, "agent": agent, "rep": int(rep), "cli": cli}
result.update(json.loads(fields))
with open(path, "w") as f:
    json.dump(result, f, indent=2)
    f.write("\n")
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
