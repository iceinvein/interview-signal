#!/usr/bin/env bash
# Runs agents over tasks, one fresh session per run, and writes
#   runs/<format>__<id>__<agent>__r<rep>/{transcript.jsonl,stderr.txt,output/,final_message.txt,result.json}
#
#   ./run.sh --one <format> <id> <agent> <rep>   exactly one run
#   ./run.sh --rebuild-result <run dir>          recompute result.json and
#                                                final_message.txt from the
#                                                run's transcript.jsonl
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
# scratch one holding credentials and a config that pins the operator's model
# and effort, turns off Codex's own web search, and lets the sandbox reach the
# network (to install packages, as Claude can), never the operator's
# AGENTS.md.
make_codex_home() { # make_codex_home <dir>
  local auth="$HOME/.codex/auth.json"
  [[ -f "$auth" ]] || { echo "missing Codex credentials: $auth" >&2; return 1; }
  mkdir "$1"
  cp "$auth" "$1/auth.json"
  cat > "$1/config.toml" <<'TOML'
model = "gpt-6-sol"
model_reasoning_effort = "high"
web_search = "disabled"

[sandbox_workspace_write]
network_access = true
TOML
}

# Claude's login lives in the macOS keychain, which a session with a scratch
# HOME cannot find, so the session gets the one thing it needs from it: the
# claude.ai access token, as the plaintext credentials file Claude falls back
# to. Not the refresh token (a session that refreshed could rotate it and log
# the operator out) and not the MCP server tokens stored beside it. Without a
# refresh token the session cannot outlive the access token, so a token that
# would expire before the run's wall-clock cap stops the run before it starts.
write_claude_credentials() { # write_claude_credentials <file> <seconds needed>
  security find-generic-password -s "Claude Code-credentials" -a "$USER" -w \
    | python3 -c '
import json, sys, time
path, needed = sys.argv[1], float(sys.argv[2])
oauth = json.load(sys.stdin)["claudeAiOauth"]
left = oauth["expiresAt"] / 1000 - time.time()
if left < needed:
    sys.exit(f"Claude access token expires in {left / 60:.0f} min, before this run could end "
             f"({needed / 60:.0f} min); use Claude Code interactively until it refreshes, then retry")
fields = ("accessToken", "expiresAt", "scopes", "subscriptionType")
with open(path, "x") as f:
    json.dump({"claudeAiOauth": {k: oauth[k] for k in fields}}, f)' "$1" "$2"
}

# make_run_root <agent> <wall_s> -> prints a fresh private directory holding
#   work/   the agent's working directory, empty
#   home/   its HOME: a .gitconfig naming a placeholder candidate with signing
#           off, plus (Claude only) .claude/.credentials.json
#   tmp/    its TMPDIR, so it cannot stumble on other runs' temp dirs
#   codex/  (Codex only) its CODEX_HOME
# The operator's own HOME holds a gh login, SSH keys and a signing git
# config, and a session that found them once pushed to GitHub as the operator.
# The caller removes the directory.
make_run_root() {
  local agent=$1 wall_s=$2 root
  root=$(mktemp -d)
  mkdir "$root/work" "$root/home" "$root/tmp"
  cat > "$root/home/.gitconfig" <<'GIT'
[user]
	name = Candidate
	email = candidate@example.invalid
[commit]
	gpgsign = false
GIT
  if [[ "$agent" == codex ]]; then
    make_codex_home "$root/codex" || { rm -rf "$root"; return 1; }
  else
    mkdir "$root/home/.claude"
    # A minute past the cap covers the grace run_timed gives a stopped agent.
    write_claude_credentials "$root/home/.claude/.credentials.json" $((wall_s + 60)) \
      || { rm -rf "$root"; return 1; }
  fi
  echo "$root"
}

# Fills the named array with the agent's exact command line.
agent_command() {
  local -n into=$1
  local agent=$2 prompt=$3 budget=$4
  case "$agent" in
    sonnet | opus | haiku)
      into=(claude -p "$prompt" --model "$agent" --setting-sources project
        --output-format stream-json --verbose
        --tools Bash Edit Glob Grep Read Write TodoWrite Task
        --allowedTools Read Write Edit Glob Grep Bash
        --disallowedTools WebSearch WebFetch Workflow RemoteTrigger SendMessage
        --strict-mcp-config
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

# run_timed <wall_s> <cwd> <stdout> <stderr> <status.json> <run root> -- <command...>
# Runs the command in its own session under an allowlisted environment, with
# HOME, TMPDIR and (when the root has one) CODEX_HOME from make_run_root, and
# records exit code, wall time, whether the cap was hit and any signal that
# stopped it. Whatever the agent started is killed when it exits, when the
# cap is hit, or when this runner gets SIGINT, SIGTERM or SIGHUP: the process
# group, plus descendants that left it with setsid, which a ps walk finds
# while their parent is still alive.
run_timed() {
  python3 - "$@" <<'PY'
import json, os, signal, subprocess, sys, time

wall_s, cwd, out_path, err_path, status_path, root = sys.argv[1:7]
assert sys.argv[7] == "--"
command = sys.argv[8:]

# Anything else in the operator's shell (CLAUDE*, CODEX*, NODE_OPTIONS,
# SSH_AUTH_SOCK, GH_TOKEN, ...) could change how a session behaves or what it
# can reach. The system git config is skipped because macOS's names the
# keychain as a credential helper.
env = {k: os.environ[k] for k in ("PATH", "USER", "LANG") if k in os.environ}
env.update(TZ="UTC", PWD=cwd, HOME=os.path.join(root, "home"), TMPDIR=os.path.join(root, "tmp"),
           GIT_CONFIG_NOSYSTEM="1")
if os.path.isdir(os.path.join(root, "codex")):
    env["CODEX_HOME"] = os.path.join(root, "codex")


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
reaped = False
stopped_by = None
known = {}


def kill_all(sig):
    # Only before the leader is reaped: until then its zombie holds its pid,
    # so the group id and the walk from it cannot reach an unrelated process.
    if proc is None or reaped:
        return
    try:
        os.killpg(proc.pid, sig)
    except ProcessLookupError:
        pass
    except PermissionError:
        pass  # macOS answers EPERM when the group's only member is the unreaped leader.
    table = process_table()
    for pid, started in {**known, **descendants(proc.pid, table)}.items():
        if table.get(pid, (None, None))[1] == started:
            try:
                os.kill(pid, sig)
            except ProcessLookupError:
                pass


def on_signal(signum, frame):
    global stopped_by
    stopped_by = signal.Signals(signum).name
    kill_all(signal.SIGKILL)


def leader_exited():
    # WNOWAIT leaves the leader unreaped, so kill_all stays safe afterwards.
    return os.waitid(os.P_PID, proc.pid, os.WEXITED | os.WNOHANG | os.WNOWAIT) is not None


def wait_for_exit(until):
    while not leader_exited():
        if stopped_by:
            kill_all(signal.SIGKILL)  # the signal came before the agent had started
        known.update(descendants(proc.pid, process_table()))
        remaining = until - time.monotonic()
        if remaining <= 0:
            return False
        time.sleep(min(1.0, remaining))
    return True


for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
    signal.signal(sig, on_signal)

start = time.monotonic()
timed_out = False
with open(out_path, "wb") as out, open(err_path, "wb") as err:
    proc = subprocess.Popen(command, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
                            stdout=out, stderr=err, start_new_session=True)
    if not wait_for_exit(start + float(wall_s)):
        timed_out = True
        kill_all(signal.SIGTERM)
        wait_for_exit(time.monotonic() + 10)
    # Also after a clean exit: a background child of the agent would
    # otherwise keep writing to the workspace while it is copied.
    kill_all(signal.SIGKILL)
    signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGINT, signal.SIGTERM, signal.SIGHUP})
    code = proc.wait()
    reaped = True
    signal.pthread_sigmask(signal.SIG_UNBLOCK, {signal.SIGINT, signal.SIGTERM, signal.SIGHUP})
with open(status_path, "w") as f:
    json.dump({"exit_code": code, "timed_out": timed_out, "interrupted": stopped_by,
               "wall_s": round(time.monotonic() - start, 3)}, f)
PY
}

# summarise <agent> <transcript> <status.json> <codex_home|""> <final_message.txt>
# Prints JSON with the per-agent fields of result.json and writes the agent's
# final message. A value the agent did not report is null, never guessed; with
# no codex_home, Codex's model and effort are null.
summarise() {
  python3 - "$REPO" "$@" <<'PY'
import glob, ipaddress, json, os, re, shlex, sys, urllib.parse

repo, agent, transcript, status_path, codex_home, final_path = sys.argv[1:7]
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


failed_run = status["exit_code"] != 0 or status["timed_out"] or bool(status["interrupted"])
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
    rollouts = glob.glob(os.path.join(codex_home, "sessions", "**", "rollout-*.jsonl"), recursive=True) if codex_home else []
    for path in sorted(rollouts):
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
    # A background task that ends after the answer (a Monitor timing out)
    # makes Claude emit a further, shorter result event. The answer is the
    # result with the most turns; cost is cumulative, so the last one has it.
    results = [e for e in events if e.get("type") == "result"]
    result = results[-1] if results else None
    answer = max(results, key=lambda e: e.get("num_turns") or 0) if results else None
    commands = [c["input"]["command"] for e in events if e.get("type") == "assistant"
                for c in e.get("message", {}).get("content", [])
                if c.get("type") == "tool_use" and c.get("name") == "Bash" and "command" in c.get("input", {})]
    final = answer.get("result") if answer else None
    fields = {"model": init.get("model"), "effort": None,
              "is_error": failed_run or result is None or bool(result.get("is_error")),
              "cost_usd": result.get("total_cost_usd") if result else None,
              "turns": answer.get("num_turns") if answer else None,
              "codex_steps": None,
              "usage": result.get("usage") if result else None}

# Signs the agent went looking for the answers or the operator's own
# instructions instead of doing the task.
said = raw + "\n" + "\n".join(s for e in events for s in strings(e))
markers = (repo, "hidden/", "reference/", "rubric.json", ".claude/CLAUDE.md", ".codex/AGENTS.md")
fields["contamination"] = [m for m in markers if m in said]

# Any URL in a command the agent ran counts, since a fetch can go through
# git, pip, or a one-line script as easily as curl; so does any gh command and
# the target of any git push, clone or remote add, since those act on GitHub
# (or another host) as whoever the session is logged in as. Package
# registries are how both agents install dependencies. Reserved test domains,
# bare hostnames and loopback cannot reach anyone else's server.
allowed_hosts = {"registry.npmjs.org", "pypi.org", "files.pythonhosted.org", "0.0.0.0"}
reserved_suffixes = (".example", ".test", ".invalid", ".localhost")


def ignored_host(host):
    if not host or host in allowed_hosts or host.endswith(reserved_suffixes):
        return True
    if "." not in host and ":" not in host:
        return True  # a bare hostname: the agent's own machine or network
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


# Where a command's text ends inside a line: a shell separator, or the quote
# that closes a `bash -lc '...'` wrapper.
SEGMENT = r"[^;&|\n'\"`()]*"
STARTS = r"(?:^|(?<=[\s;&|('\"`]))(?:\S*/)?"
GIT_VALUE_OPTIONS = {"-C", "-c", "-b", "--branch", "-o", "--origin", "--depth", "--reference",
                     "--config", "-j", "--jobs", "--filter", "--template", "--separate-git-dir",
                     "-u", "--upload-pack", "--receive-pack", "--push-option", "--shallow-since"}


def positionals(words):
    out, skip = [], False
    for w in words:
        if skip:
            skip = False
        elif w in GIT_VALUE_OPTIONS:
            skip = True
        elif not w.startswith("-"):
            out.append(w)
    return out


def shell_words(text):
    try:
        return shlex.split(text)
    except ValueError:
        return text.split()


def git_targets(command):
    for m in re.finditer(STARTS + r"git((?:\s+(?:-[Cc]\s+\S+|--?[\w-]+(?:=\S+)?))*)\s+(push|clone|remote\s+add)\b(" + SEGMENT + ")", command):
        sub, args = m.group(2).split()[0], positionals(shell_words(m.group(3)))
        if sub == "remote":
            target = args[1] if len(args) > 1 else None  # remote add <name> <url>
        else:
            target = args[0] if args else None
        if target is None:
            if sub == "push":
                yield "git push"
            continue
        if target.startswith(("/", ".", "~", "file:")):
            continue  # a local repository
        if "://" in target:
            host = urllib.parse.urlparse(target).hostname
        elif ":" in target:
            host = target.split(":", 1)[0].rsplit("@", 1)[-1]
        elif sub == "push":
            yield f"git push {target}"  # a remote named earlier, which could point anywhere
            continue
        else:
            continue  # clone or remote add of a relative local path
        if not ignored_host(host):
            yield target


fetches = []
for command in commands:
    found = [url for url in re.findall(r"https?://[^\s'\"<>()\\;&|`]+", command)
             if not ignored_host(urllib.parse.urlparse(url).hostname)]
    found += ["gh" + m.group(1).rstrip() for m in re.finditer(STARTS + r"gh(\s" + SEGMENT + ")", command)]
    found += list(git_targets(command))
    for item in found:
        if item not in fetches:
            fetches.append(item)
fields["external_fetches"] = fetches

# An agent that sent no final message leaves no final_message.txt, rather
# than an empty one that reads as a blank answer.
if final is not None:
    with open(final_path, "w") as f:
        f.write(final)
fields.update(timed_out=status["timed_out"], interrupted=status["interrupted"],
              exit_code=status["exit_code"], wall_s=status["wall_s"])
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

# Once the agent is running, a stop signal to the runner is passed to
# run_timed, which kills the agent at once; the runner then records the run
# (it has been paid for) and exits with the signal's status.
STOP_SIGNAL=""
TIMED_PID=""
forward_stop() {
  STOP_SIGNAL=${STOP_SIGNAL:-$1}
  # TIMED_PID is the background subshell; the helper that owns the agent is
  # its child.
  [[ -z "$TIMED_PID" ]] || pkill -TERM -P "$TIMED_PID" || true
}

run_one() {
  local format=$1 id=$2 agent=$3 rep=$4
  local task="$TASKS_DIR/$format/$id"
  local dir="$RUNS_DIR/${format}__${id}__${agent}__r${rep}"
  [[ -d "$task" ]] || { echo "no such task: $task" >&2; return 1; }

  # The run's private root (with its credential copies) and the lock go
  # however the run ends. A stop signal before the agent starts ends the run
  # unrecorded; once it has started, forward_stop takes over.
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
  local budget=${BUDGET:-$(default_budget "$format")}
  local wall_s=${WALL_S:-$(default_wall_s "$format")}
  local root work codex_home=""
  root=$(make_run_root "$agent" "$wall_s")
  CLEANUP+=("$root")
  work="$root/work"
  [[ "$agent" != codex ]] || codex_home="$root/codex"

  # A directory without result.json is a run that died part way; start over.
  rm -rf "$dir"
  mkdir -p "$dir"
  if [[ "$format" == perf ]]; then
    "$task/fetch.sh" "$work"
    perf_tree snapshot "$work" "$root/snapshot.json"
  else
    cp -R "$task/workspace/." "$work/"
  fi

  local -a command_line
  agent_command command_line "$agent" "$(cat "$task/prompt.md")" "$budget"
  local cli
  cli=$(agent_cli_version "$agent")

  echo "run  $(basename "$dir")"
  trap 'forward_stop HUP' HUP
  trap 'forward_stop INT' INT
  trap 'forward_stop TERM' TERM
  # In the background, because bash runs a trap only after the foreground
  # command ends, which for an agent can be two hours away. The subshell
  # ignores stop signals so a signal to the whole group cannot end it before
  # the helper (which sets its own handlers) has recorded the run.
  (
    trap '' HUP INT TERM
    run_timed "$wall_s" "$work" "$dir/transcript.jsonl" "$dir/stderr.txt" "$root/status.json" "$root" -- "${command_line[@]}"
  ) &
  TIMED_PID=$!
  [[ -z "$STOP_SIGNAL" ]] || forward_stop "$STOP_SIGNAL"
  # wait returns early whenever a trapped signal arrives; keep waiting until
  # run_timed has written its status and gone.
  until wait "$TIMED_PID"; do
    kill -0 "$TIMED_PID" 2>/dev/null || break
  done
  [[ -f "$root/status.json" ]] || { echo "run_timed failed without recording a status" >&2; return 1; }

  # Agents sometimes git init their workspace; a nested .git cannot be
  # committed under runs/, and dependencies and bytecode are rebuilt when scoring.
  if [[ "$format" == perf ]]; then
    perf_tree collect "$work" "$root/snapshot.json" "$task/run_config.json" "$dir/output"
  else
    rsync -a --exclude node_modules --exclude .git --exclude __pycache__ "$work/" "$dir/output/"
  fi

  local fields
  fields=$(summarise "$agent" "$dir/transcript.jsonl" "$root/status.json" "$codex_home" "$dir/final_message.txt")
  local base
  base=$(python3 -c 'import json, sys
fmt, task, agent, rep, cli = sys.argv[1:6]
print(json.dumps({"format": fmt, "task": task, "agent": agent, "rep": int(rep), "cli": cli}))' \
    "$format" "$id" "$agent" "$rep" "$cli")
  write_result "$dir/result.json" "$base" "$fields"
  case "$STOP_SIGNAL" in
    HUP) exit 129 ;;
    INT) exit 130 ;;
    TERM) exit 143 ;;
  esac
}

# write_result <result.json> <base JSON> <fields JSON>: the base overlaid
# with the fields, written aside and renamed so a result.json that exists is
# always whole.
write_result() {
  python3 - "$@" <<'PY'
import json, os, sys
path, base, fields = sys.argv[1:4]
result = json.loads(base)
result.update(json.loads(fields))
with open(path + ".tmp", "w") as f:
    json.dump(result, f, indent=2)
    f.write("\n")
os.replace(path + ".tmp", path)
PY
}

# Recomputes a recorded run's result.json and final_message.txt from its
# transcript, for when the summary logic changes after the run. The exit
# status, wall time and CLI version come from the old result.json, since the
# transcript does not hold them; so do Codex's model and effort, which came
# from a session rollout deleted with the run's private root.
rebuild_result() {
  local dir=${1%/} status agent fields
  [[ -f "$dir/result.json" && -f "$dir/transcript.jsonl" ]] \
    || { echo "no result.json and transcript.jsonl in $dir" >&2; return 1; }
  trap cleanup EXIT
  status=$(mktemp)
  CLEANUP+=("$status")
  python3 - "$dir/result.json" "$status" <<'PY'
import json, sys
old = json.load(open(sys.argv[1]))
json.dump({k: old[k] for k in ("exit_code", "timed_out", "interrupted", "wall_s")}, open(sys.argv[2], "w"))
PY
  agent=$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["agent"])' "$dir/result.json")
  rm -f "$dir/final_message.txt"
  fields=$(summarise "$agent" "$dir/transcript.jsonl" "$status" "" "$dir/final_message.txt")
  if [[ "$agent" == codex ]]; then
    fields=$(python3 -c 'import json, sys
old, new = json.load(open(sys.argv[1])), json.loads(sys.argv[2])
new.update(model=old["model"], effort=old["effort"])
print(json.dumps(new))' "$dir/result.json" "$fields")
  fi
  write_result "$dir/result.json" "$(cat "$dir/result.json")" "$fields"
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
  elif [[ "${1:-}" == --rebuild-result ]]; then
    [[ $# -eq 2 ]] || { echo "usage: $0 --rebuild-result <run dir>" >&2; return 2; }
    rebuild_result "$2"
  elif [[ $# -eq 0 ]]; then
    run_all
  else
    echo "usage: $0 [--one <format> <id> <agent> <rep> | --rebuild-result <run dir>]" >&2
    return 2
  fi
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
