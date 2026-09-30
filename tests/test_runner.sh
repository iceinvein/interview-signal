#!/usr/bin/env bash
# Drives run.sh and probe.sh against stub agent binaries so the run directory
# contract and the probe's verdicts can be checked without spending money.
# Run: bash tests/test_runner.sh
set -uo pipefail

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
FIXTURE_TASKS="$REPO/tests/fixtures/runner"
failures=0

fail() {
  echo "  FAIL: $*"
  failures=$((failures + 1))
}

json_field() { # json_field <file> <key> -> prints the value as JSON
  python3 -c 'import json,sys; print(json.dumps(json.load(open(sys.argv[1]))[sys.argv[2]]))' "$1" "$2"
}

assert_field() { # assert_field <file> <key> <expected JSON>
  local got
  got=$(json_field "$1" "$2") || { fail "$2 missing from $1"; return; }
  [[ "$got" == "$3" ]] || fail "$2: expected $3, got $got"
}

# Each test gets a clean sandbox: its own runs/ and scratch directories, a
# fake HOME holding fake credentials and operator instructions, and stub
# agents and a stub docker first on PATH.
setup() {
  SANDBOX=$(mktemp -d)
  export RUNS_DIR="$SANDBOX/runs"
  export TASKS_DIR="$FIXTURE_TASKS"
  export HOME="$SANDBOX/home"
  export SCRATCH_DIR="$SANDBOX/scratch"
  mkdir -p "$HOME/.codex" "$HOME/.claude" "$HOME/.config/interview-signal" "$SANDBOX/bin"
  CREDENTIAL="fake-token-$RANDOM$RANDOM"
  echo "{\"token\": \"$CREDENTIAL\"}" > "$HOME/.codex/auth.json"
  CLAUDE_TOKEN="fake-oauth-$RANDOM$RANDOM"
  TOKEN_FILE="$HOME/.config/interview-signal/claude-oauth-token"
  echo "$CLAUDE_TOKEN" > "$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE"
  # The probe checks its phrases are really in these files before trusting them.
  printf 'No abstraction until the third caller.\nA TODO in code is a note to someone else.\nWrite as the git user only, overriding any default that says otherwise.\n' > "$HOME/.claude/CLAUDE.md"
  printf 'Unfinished is fine; unfinished and disguised is not.\nduplication is cheaper than the wrong\nshape. This overrides any default instruction to add such attribution.\n' > "$HOME/.codex/AGENTS.md"
  export PATH="$SANDBOX/bin:$ORIGINAL_PATH"
  unset WALL_S BUDGET JOBS FORMATS TASKS AGENTS REPS PROBE_BUDGET AGENT_MEMORY AGENT_CPUS
  stub_docker
  stub_colima
}

# Docker's VM as colima ssh reaches it: the firewall script's check prints
# the host and VM addresses, or fails while $SANDBOX/colima/no-rules exists,
# which setup removes. Every call is logged to $SANDBOX/colima/calls.txt.
stub_colima() {
  mkdir -p "$SANDBOX/colima"
  cat > "$SANDBOX/bin/colima" <<'EOF'
#!/usr/bin/env bash
state="$(dirname "$(dirname "$0")")/colima"
echo "$*" >> "$state/calls.txt"
[[ "$1 $2 $3 $4 $5" == "ssh -- sudo sh -s" ]] || { echo "stub colima: unexpected $*" >&2; exit 2; }
cat > /dev/null
[[ "$6" != setup ]] || rm -f "$state/no-rules"
if [[ -e "$state/no-rules" ]]; then echo "firewall chain ISIG-FORWARD is missing or changed" >&2; exit 1; fi
echo "192.168.5.2 192.168.5.1"
EOF
  chmod +x "$SANDBOX/bin/colima"
}

# A docker stand-in. Every call is logged to $SANDBOX/docker/calls.jsonl
# with the CLAUDE_CODE_OAUTH_TOKEN docker itself was given. `docker run`
# plays the container on the host: the command runs in the host directory
# mounted at the --workdir, with only the -e variables (container paths in
# them mapped back to the host), in its own process group, which
# `docker kill <name>` kills and a signal to the client is passed on to, as
# docker's own signal proxy does. The image exists until the test removes
# $SANDBOX/docker/image; $SANDBOX/docker/unshared makes every mount an empty
# directory, as Docker's VM does for a host path it does not share.
stub_docker() {
  mkdir -p "$SANDBOX/docker/home" "$SANDBOX/docker/empty"
  touch "$SANDBOX/docker/image"
  echo "false isig-runs 172.30.9.1 false" > "$SANDBOX/docker/network"
  cat > "$SANDBOX/bin/docker" <<'EOF'
#!/usr/bin/env python3
import json, os, signal, subprocess, sys

state = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docker")
args = sys.argv[1:]
with open(os.path.join(state, "calls.jsonl"), "a") as log:
    log.write(json.dumps({"args": args, "token": os.environ.get("CLAUDE_CODE_OAUTH_TOKEN")}) + "\n")

if args[:2] == ["network", "ls"]:
    if os.path.exists(os.path.join(state, "network")):
        print("stubnetid")
    sys.exit(0)
if args[:2] == ["network", "inspect"]:
    try:
        print(open(os.path.join(state, "network")).read().strip())
    except FileNotFoundError:
        print(f"Error response from daemon: network {args[-1]} not found", file=sys.stderr)
        sys.exit(1)
    sys.exit(0)
if args[:2] == ["network", "create"]:
    open(os.path.join(state, "network"), "w").write("false isig-runs 172.30.9.1 false\n")
    print("stubnetid")
    sys.exit(0)
if args[0] == "ps":
    name = args[args.index("--filter") + 1].removeprefix("name=^").removesuffix("$")
    if os.path.exists(os.path.join(state, name + ".pid")):
        print("stubcontainerid")
    sys.exit(0)
if args[:2] == ["image", "inspect"]:
    if os.path.exists(os.path.join(state, "image")):
        print("sha256:stub")
        sys.exit(0)
    print("Error response from daemon: No such image", file=sys.stderr)
    sys.exit(1)
if args[0] == "kill":
    try:
        pid = int(open(os.path.join(state, args[1] + ".pid")).read())
        os.killpg(pid, signal.SIGKILL)
    except (FileNotFoundError, ProcessLookupError):
        print(f"Error response from daemon: No such container: {args[1]}", file=sys.stderr)
        sys.exit(1)
    sys.exit(0)
if args[0] == "build":
    sys.exit(0)
assert args[0] == "run", args

VALUED = {"--name", "--user", "--workdir", "--memory", "--cpus", "--network", "--security-opt", "-v", "-e"}
FLAGS = {"--rm", "--init"}
opts, i = [], 1
while args[i].startswith("-"):
    if args[i] in FLAGS:
        opts.append((args[i], None))
        i += 1
    elif args[i] in VALUED:
        opts.append((args[i], args[i + 1]))
        i += 2
    else:
        sys.exit(f"stub docker: unknown option {args[i]}")
command = args[i + 1:]
# The isolation preflight asks for TCP connections, which the host cannot
# answer for the container: private targets report closed and port 443
# open, unless the test lists a target in preflight-open or preflight-closed.
if command[:2] == ["bash", "-c"] and command[3:4] == ["preflight"]:
    def listed(name):
        try:
            return open(os.path.join(state, name)).read().split()
        except FileNotFoundError:
            return []
    for target in command[4:]:
        is_open = (target.endswith(":443") or target in listed("preflight-open")) and target not in listed("preflight-closed")
        print(("open " if is_open else "closed ") + target)
    sys.exit(0)
mounts = [v.split(":", 1) for k, v in opts if k == "-v"]


def host_path(path):
    for src, dst in mounts:
        if os.path.exists(os.path.join(state, "unshared")):
            src = os.path.join(state, "empty")  # what a VM that does not share src mounts
        if path == dst or path.startswith(dst + "/"):
            return src + path[len(dst):]
    return path


env = {"PATH": os.environ["PATH"], "HOME": os.path.join(state, "home")}
for k, v in opts:
    if k == "-e":
        name, sep, value = v.partition("=")
        if sep:
            env[name] = host_path(value)
        elif name in os.environ:
            env[name] = os.environ[name]
workdir = host_path(dict(opts).get("--workdir", "/"))
name = dict(opts).get("--name")
proc = subprocess.Popen(command, cwd=workdir, env=env, stdin=subprocess.DEVNULL, start_new_session=True)
pid_file = os.path.join(state, f"{name}.pid") if name else None
if pid_file:
    open(pid_file, "w").write(str(proc.pid))


def forward(signum, frame):
    try:
        os.killpg(proc.pid, signum)
    except ProcessLookupError:
        pass


for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
    signal.signal(sig, forward)
code = proc.wait()
if pid_file:
    os.remove(pid_file)
sys.exit(128 - code if code < 0 else code)
EOF
  chmod +x "$SANDBOX/bin/docker"
}

# The arguments of the docker run that started the agent (the one naming its
# container), one per line.
agent_docker_args() {
  python3 -c 'import json, sys
for line in open(sys.argv[1]):
    call = json.loads(line)
    if call["args"][:1] == ["run"] and "--name" in call["args"]:
        print("\n".join(call["args"]))
        break' "$SANDBOX/docker/calls.jsonl"
}

# The value after every occurrence of an option in the agent's docker run.
docker_option_values() { # docker_option_values <option>
  agent_docker_args | awk -v opt="$1" 'take { print; take = 0; next } $0 == opt { take = 1 }'
}

teardown() { rm -rf "$SANDBOX"; }

# A Claude stand-in: writes into its workspace and prints a stream-json init
# and result event with values the assertions below spell out by hand.
stub_claude() {
  cat > "$SANDBOX/bin/claude" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == "--version" ]]; then echo "9.9.9 (Stub Code)"; exit 0; fi
pwd -P > cwd.txt
echo "agent wrote this" > made-by-agent.txt
mkdir -p node_modules/left-pad && echo x > node_modules/left-pad/index.js
mkdir -p .git && echo "ref: refs/heads/main" > .git/HEAD
mkdir -p lib/__pycache__ && echo x > lib/__pycache__/mod.pyc && echo "source" > lib/mod.py
echo '{"type":"system","subtype":"init","model":"claude-stub-1","mcp_servers":[]}'
echo '{"type":"assistant","message":{"content":[{"type":"text","text":"done"}]}}'
echo '{"type":"result","subtype":"success","is_error":false,"num_turns":3,"total_cost_usd":0.25,"result":"All done here.","usage":{"input_tokens":10,"output_tokens":20}}'
EOF
  chmod +x "$SANDBOX/bin/claude"
}

stub_claude_body() { # replaces the stub's behaviour after --version
  printf '#!/usr/bin/env bash\nif [[ "$1" == "--version" ]]; then echo "9.9.9 (Stub Code)"; exit 0; fi\n%s\n' "$1" > "$SANDBOX/bin/claude"
  chmod +x "$SANDBOX/bin/claude"
}

# A Codex stand-in: records what its CODEX_HOME holds, writes a rollout file
# the way codex does (with a line cut short, as a killed session leaves), and
# prints codex exec --json events.
stub_codex() {
  cat > "$SANDBOX/bin/codex" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == "--version" ]]; then echo "codex-cli 0.0.1"; exit 0; fi
(cd "$CODEX_HOME" && ls -A) > codex-home.txt
cp "$CODEX_HOME/config.toml" codex-config.toml
mkdir -p "$CODEX_HOME/sessions/2026/01/01"
{
  echo '{"type":"session_meta","payload":{}}'
  echo '{"type":"turn_context","payload":{"model":"gpt-stub","effort":"high"}}'
  printf '{"type":"event_msg","payl'
} > "$CODEX_HOME/sessions/2026/01/01/rollout-x.jsonl"
echo "codex wrote this" > made-by-agent.txt
echo '{"type":"thread.started","thread_id":"t1"}'
echo '{"type":"turn.started"}'
echo '{"type":"item.completed","item":{"id":"item_0","type":"reasoning","text":"thinking"}}'
echo '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"first"}}'
echo '{"type":"item.completed","item":{"id":"item_2","type":"command_execution","command":"ls","exit_code":0}}'
echo '{"type":"item.completed","item":{"id":"item_3","type":"agent_message","text":"last words"}}'
echo '{"type":"turn.completed","usage":{"input_tokens":100,"cached_input_tokens":40,"output_tokens":7}}'
EOF
  chmod +x "$SANDBOX/bin/codex"
}

# One Claude event line per argument, then a successful result event.
claude_events() {
  local body="" line
  for line in "$@"; do body+="echo '$line'"$'\n'; done
  body+="echo '{\"type\":\"result\",\"is_error\":false,\"num_turns\":1,\"total_cost_usd\":0.01,\"result\":\"ok\"}'"
  stub_claude_body "$body"
}

bash_tool_use() { # the stream-json event for a Bash tool call running $1
  python3 -c 'import json,sys; print(json.dumps({"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":sys.argv[1]}}]}}))' "$1"
}

run_one() { "$REPO/run.sh" --one "$@" >/dev/null 2>&1; }

RUN="takehome__stub-task__sonnet__r1"
CODEX_RUN="takehome__stub-task__codex__r1"
PERF_RUN="perf__stub-perf__sonnet__r1"

wait_for_file() { # polls for a file the stub writes once it is running
  local i
  for i in $(seq 100); do [[ -s "$1" ]] && return 0; sleep 0.1; done
  return 1
}

assert_dead() { # assert_dead <pid file> <what>
  local pid
  pid=$(cat "$1" 2>/dev/null) || { fail "stub did not record $2"; return; }
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid"
    fail "$2 ($pid) outlived the run"
  fi
}

# --- result.json -----------------------------------------------------------

test_claude_run_writes_result_json_from_the_result_event() {
  stub_claude
  run_one takehome stub-task sonnet 1 || fail "run.sh exited non-zero"
  local result="$RUNS_DIR/$RUN/result.json"
  [[ -f "$result" ]] || { fail "no result.json at $result"; return; }
  assert_field "$result" format '"takehome"'
  assert_field "$result" task '"stub-task"'
  assert_field "$result" agent '"sonnet"'
  assert_field "$result" rep '1'
  assert_field "$result" cli '"9.9.9 (Stub Code)"'
  assert_field "$result" model '"claude-stub-1"'
  assert_field "$result" effort 'null'
  assert_field "$result" is_error 'false'
  assert_field "$result" cost_usd '0.25'
  assert_field "$result" turns '3'
  assert_field "$result" codex_steps 'null'
  assert_field "$result" interrupted 'null'
  python3 -c 'import json,sys; w=json.load(open(sys.argv[1]))["wall_s"]; sys.exit(0 if isinstance(w,(int,float)) and w>=0 else 1)' "$result" \
    || fail "wall_s is not a non-negative number"
}

test_codex_run_records_model_effort_and_token_usage() {
  stub_codex
  run_one takehome stub-task codex 1 || fail "run.sh exited non-zero"
  local result="$RUNS_DIR/$CODEX_RUN/result.json"
  [[ -f "$result" ]] || { fail "no result.json"; return; }
  assert_field "$result" cli '"codex-cli 0.0.1"'
  assert_field "$result" model '"gpt-stub"'
  assert_field "$result" effort '"high"'
  assert_field "$result" is_error 'false'
  assert_field "$result" cost_usd 'null'
  assert_field "$result" turns '1'
  assert_field "$result" usage '{"input_tokens": 100, "cached_input_tokens": 40, "output_tokens": 7}'
}

test_codex_steps_count_commands_and_messages() {
  stub_codex
  run_one takehome stub-task codex 1
  assert_field "$RUNS_DIR/$CODEX_RUN/result.json" codex_steps '3'
}

# A background task timing out after the answer (Monitor does this) makes
# Claude emit a second, shorter result event; its cost is cumulative.
TWO_RESULTS='echo "{\"type\":\"system\",\"subtype\":\"init\",\"model\":\"claude-stub-1\"}"
echo "{\"type\":\"result\",\"is_error\":false,\"num_turns\":7,\"total_cost_usd\":0.30,\"result\":\"The real answer.\"}"
echo "{\"type\":\"result\",\"is_error\":false,\"num_turns\":1,\"total_cost_usd\":0.42,\"result\":\"Monitor timed out.\"}"'

test_claude_turns_come_from_the_longest_result_event_and_cost_from_the_last() {
  stub_claude_body "$TWO_RESULTS"
  run_one takehome stub-task sonnet 1
  assert_field "$RUNS_DIR/$RUN/result.json" turns '7'
  assert_field "$RUNS_DIR/$RUN/result.json" cost_usd '0.42'
}

test_claude_final_message_comes_from_the_longest_result_event() {
  stub_claude_body "$TWO_RESULTS"
  run_one takehome stub-task sonnet 1
  [[ "$(cat "$RUNS_DIR/$RUN/final_message.txt" 2>/dev/null)" == "The real answer." ]] || fail "final_message.txt: '$(cat "$RUNS_DIR/$RUN/final_message.txt" 2>/dev/null)'"
}

test_rebuild_result_recomputes_result_and_final_message_from_the_transcript() {
  local dir="$RUNS_DIR/$RUN"
  mkdir -p "$dir/output"
  bash -c "$TWO_RESULTS" > "$dir/transcript.jsonl"
  echo "Monitor timed out." > "$dir/final_message.txt"
  cat > "$dir/result.json" <<'EOF'
{"format": "takehome", "task": "stub-task", "agent": "sonnet", "rep": 1, "cli": "9.9.9 (Stub Code)",
 "model": "claude-stub-1", "effort": null, "is_error": false, "cost_usd": 0.42, "turns": 1,
 "codex_steps": null, "usage": null, "contamination": [], "external_fetches": [],
 "timed_out": false, "interrupted": null, "exit_code": 0, "wall_s": 12.5}
EOF
  "$REPO/run.sh" --rebuild-result "$dir" >/dev/null 2>&1 || fail "--rebuild-result exited non-zero"
  assert_field "$dir/result.json" turns '7'
  assert_field "$dir/result.json" cost_usd '0.42'
  assert_field "$dir/result.json" wall_s '12.5'
  assert_field "$dir/result.json" cli '"9.9.9 (Stub Code)"'
  [[ "$(cat "$dir/final_message.txt")" == "The real answer." ]] || fail "final_message.txt: '$(cat "$dir/final_message.txt")'"
}

test_rebuild_result_keeps_codex_model_and_effort() {
  # They come from the session rollout, which is gone once the run ends.
  local dir="$RUNS_DIR/$CODEX_RUN"
  mkdir -p "$dir/output"
  printf '%s\n' '{"type":"item.completed","item":{"type":"agent_message","text":"codex answer"}}' '{"type":"turn.completed","usage":{"input_tokens":5}}' > "$dir/transcript.jsonl"
  cat > "$dir/result.json" <<'EOF'
{"format": "takehome", "task": "stub-task", "agent": "codex", "rep": 1, "cli": "codex-cli 0.0.1",
 "model": "gpt-stub", "effort": "high", "is_error": true, "cost_usd": null, "turns": null,
 "timed_out": false, "interrupted": null, "exit_code": 0, "wall_s": 3.0}
EOF
  "$REPO/run.sh" --rebuild-result "$dir" >/dev/null 2>&1 || fail "--rebuild-result exited non-zero"
  assert_field "$dir/result.json" model '"gpt-stub"'
  assert_field "$dir/result.json" effort '"high"'
  assert_field "$dir/result.json" turns '1'
  assert_field "$dir/result.json" is_error 'false'
}

test_rebuild_result_refuses_a_run_without_result_json() {
  mkdir -p "$RUNS_DIR/$RUN"
  bash -c "$TWO_RESULTS" > "$RUNS_DIR/$RUN/transcript.jsonl"
  "$REPO/run.sh" --rebuild-result "$RUNS_DIR/$RUN" >/dev/null 2>&1 && fail "rebuilt a run whose exit status was never recorded"
  [[ ! -e "$RUNS_DIR/$RUN/result.json" ]] || fail "result.json was invented"
}

test_agent_without_result_event_is_recorded_as_error() {
  stub_claude_body 'echo "{\"type\":\"system\",\"subtype\":\"init\",\"model\":\"claude-stub-1\"}"'
  run_one takehome stub-task sonnet 1
  local result="$RUNS_DIR/$RUN/result.json"
  [[ -f "$result" ]] || { fail "no result.json"; return; }
  assert_field "$result" is_error 'true'
  assert_field "$result" cost_usd 'null'
  assert_field "$result" turns 'null'
}

test_clean_transcript_has_no_contamination_or_external_fetches() {
  stub_claude
  run_one takehome stub-task sonnet 1
  assert_field "$RUNS_DIR/$RUN/result.json" contamination '[]'
  assert_field "$RUNS_DIR/$RUN/result.json" external_fetches '[]'
}

test_transcript_reading_hidden_checker_is_contamination() {
  claude_events "$(bash_tool_use 'cat ../hidden/run.sh')"
  run_one takehome stub-task sonnet 1
  assert_field "$RUNS_DIR/$RUN/result.json" contamination '["hidden/"]'
}

test_transcript_naming_the_repo_path_is_contamination() {
  claude_events "$(bash_tool_use "ls $REPO")"
  run_one takehome stub-task sonnet 1
  assert_field "$RUNS_DIR/$RUN/result.json" contamination "[\"$REPO\"]"
}

test_curl_to_an_unlisted_host_is_an_external_fetch() {
  claude_events "$(bash_tool_use 'curl -s https://example.com/answers.txt; curl https://registry.npmjs.org/vitest')"
  run_one takehome stub-task sonnet 1
  assert_field "$RUNS_DIR/$RUN/result.json" external_fetches '["https://example.com/answers.txt"]'
}

test_github_fetch_is_external_outside_perf() {
  claude_events "$(bash_tool_use 'wget https://github.com/someone/solutions')"
  run_one takehome stub-task sonnet 1
  assert_field "$RUNS_DIR/$RUN/result.json" external_fetches '["https://github.com/someone/solutions"]'
}

test_url_in_any_shell_command_is_an_external_fetch() {
  claude_events "$(bash_tool_use "git clone https://github.com/a/b && pip install git+https://github.com/c/d && python3 -c \"import urllib.request; urllib.request.urlopen('https://x.io/a')\" && pip install --index-url https://pypi.org/simple x")"
  run_one takehome stub-task sonnet 1
  assert_field "$RUNS_DIR/$RUN/result.json" external_fetches '["https://github.com/a/b", "https://github.com/c/d", "https://x.io/a"]'
}

test_codex_command_url_is_an_external_fetch() {
  cat > "$SANDBOX/bin/codex" <<'EOF2'
#!/usr/bin/env bash
if [[ "$1" == "--version" ]]; then echo "codex-cli 0.0.1"; exit 0; fi
python3 -c 'import json
item = {"type": "command_execution", "command": "node -e \"fetch(\x27https://answers.io/q\x27)\"", "exit_code": 0}
print(json.dumps({"type": "item.completed", "item": item}))
print(json.dumps({"type": "turn.completed", "usage": {}}))'
EOF2
  chmod +x "$SANDBOX/bin/codex"
  run_one takehome stub-task codex 1
  assert_field "$RUNS_DIR/$CODEX_RUN/result.json" external_fetches '["https://answers.io/q"]'
}

test_gh_command_is_an_external_fetch() {
  claude_events "$(bash_tool_use 'gh pr create --title x --body y && ls')"
  run_one takehome stub-task sonnet 1
  assert_field "$RUNS_DIR/$RUN/result.json" external_fetches '["gh pr create --title x --body y"]'
}

test_gh_inside_a_shell_wrapper_is_an_external_fetch() {
  claude_events "$(bash_tool_use "/bin/zsh -lc 'gh repo fork a/b --clone'")"
  run_one takehome stub-task sonnet 1
  assert_field "$RUNS_DIR/$RUN/result.json" external_fetches '["gh repo fork a/b --clone"]'
}

test_git_push_to_a_named_remote_is_an_external_fetch() {
  claude_events "$(bash_tool_use 'git push origin main; git push')"
  run_one takehome stub-task sonnet 1
  assert_field "$RUNS_DIR/$RUN/result.json" external_fetches '["git push origin", "git push"]'
}

test_git_remote_add_and_clone_targets_are_external_fetches() {
  claude_events "$(bash_tool_use 'git remote add up git@github.com:a/b.git && git clone --depth 1 git@gitlab.com:c/d.git && git -C repo push https://github.com/e/f HEAD')"
  run_one takehome stub-task sonnet 1
  assert_field "$RUNS_DIR/$RUN/result.json" external_fetches '["https://github.com/e/f", "git@github.com:a/b.git", "git@gitlab.com:c/d.git"]'
}

test_git_clone_of_a_local_repository_is_not_an_external_fetch() {
  claude_events "$(bash_tool_use 'git clone sibling copy && git clone /tmp/r && git remote add mirror ../bare.git')"
  run_one takehome stub-task sonnet 1
  assert_field "$RUNS_DIR/$RUN/result.json" external_fetches '[]'
}

test_reserved_bare_and_loopback_hosts_are_not_external_fetches() {
  claude_events "$(bash_tool_use 'curl http://api.example/x https://svc.test/ http://h.invalid http://devbox:3000/ http://127.0.0.2:80/ http://[::1]:5/ && git clone http://gitserver/r.git && git clone ../local && git remote add o git@box.test:r.git')"
  run_one takehome stub-task sonnet 1
  assert_field "$RUNS_DIR/$RUN/result.json" external_fetches '[]'
}

test_loopback_url_is_not_an_external_fetch() {
  claude_events "$(bash_tool_use 'curl -s http://localhost:8080/health && curl http://127.0.0.1:3000/x')"
  run_one takehome stub-task sonnet 1
  assert_field "$RUNS_DIR/$RUN/result.json" external_fetches '[]'
}

test_transcript_reading_operator_instructions_is_contamination() {
  claude_events "$(bash_tool_use 'cat ~/.claude/CLAUDE.md ~/.codex/AGENTS.md')"
  run_one takehome stub-task sonnet 1
  assert_field "$RUNS_DIR/$RUN/result.json" contamination '[".claude/CLAUDE.md", ".codex/AGENTS.md"]'
}

test_result_json_is_not_left_half_written() {
  stub_claude
  run_one takehome stub-task sonnet 1
  local strays
  strays=$(cd "$RUNS_DIR/$RUN" && ls -A | grep -v -x -E 'transcript.jsonl|stderr.txt|output|result.json|final_message.txt')
  [[ -z "$strays" ]] || fail "run directory holds extra files: $strays"
}

# --- final_message.txt -----------------------------------------------------

test_claude_final_message_comes_from_the_result_event() {
  stub_claude
  run_one takehome stub-task sonnet 1
  [[ "$(cat "$RUNS_DIR/$RUN/final_message.txt" 2>/dev/null)" == "All done here." ]] || fail "final_message.txt: '$(cat "$RUNS_DIR/$RUN/final_message.txt" 2>/dev/null)'"
}

test_codex_final_message_is_the_last_agent_message() {
  stub_codex
  run_one takehome stub-task codex 1
  [[ "$(cat "$RUNS_DIR/$CODEX_RUN/final_message.txt" 2>/dev/null)" == "last words" ]] || fail "final_message.txt: '$(cat "$RUNS_DIR/$CODEX_RUN/final_message.txt" 2>/dev/null)'"
}

# --- run directory and output/ ---------------------------------------------

test_run_directory_keeps_transcript_and_stderr() {
  stub_claude
  run_one takehome stub-task sonnet 1
  local dir="$RUNS_DIR/$RUN"
  grep -q '"type":"result"' "$dir/transcript.jsonl" 2>/dev/null || fail "transcript.jsonl lacks the agent's events"
  [[ -f "$dir/stderr.txt" ]] || fail "stderr.txt missing"
}

test_output_holds_final_workspace_without_node_modules_git_or_pycache() {
  stub_claude
  run_one takehome stub-task sonnet 1
  local out="$RUNS_DIR/$RUN/output"
  [[ "$(cat "$out/given.txt" 2>/dev/null)" == "starter file" ]] || fail "output/ lacks the task's workspace file"
  [[ "$(cat "$out/made-by-agent.txt" 2>/dev/null)" == "agent wrote this" ]] || fail "output/ lacks the agent's file"
  [[ "$(cat "$out/lib/mod.py" 2>/dev/null)" == "source" ]] || fail "output/ lacks the agent's nested file"
  [[ ! -e "$out/node_modules" ]] || fail "output/ contains node_modules"
  [[ ! -e "$out/.git" ]] || fail "output/ contains .git"
  [[ ! -e "$out/lib/__pycache__" ]] || fail "output/ contains __pycache__"
}

test_agent_runs_in_a_temp_dir_outside_the_repo() {
  stub_claude
  run_one takehome stub-task sonnet 1
  local cwd repo_real
  cwd=$(cat "$RUNS_DIR/$RUN/output/cwd.txt" 2>/dev/null) || { fail "stub did not record its cwd"; return; }
  repo_real=$(cd "$REPO" && pwd -P)
  [[ "$cwd" != "$repo_real"* ]] || fail "agent ran inside the repo: $cwd"
  [[ "$cwd" != "$FIXTURE_TASKS"* ]] || fail "agent ran inside the task directory: $cwd"
}

# --- perf ------------------------------------------------------------------

PERF_EDITS='echo "faster kernel" > kernel.py; echo "my notes" > notes.md; echo "edited" > sim.py
echo "new check" > spec/mine.py; rm spec/frozen.py
mkdir -p spec/__pycache__ && echo x > spec/__pycache__/check.pyc'

test_perf_output_holds_kept_and_new_files_but_no_upstream_code() {
  stub_claude_body "$PERF_EDITS"
  run_one perf stub-perf sonnet 1 || fail "run.sh exited non-zero"
  local out="$RUNS_DIR/$PERF_RUN/output" listing
  [[ "$(cat "$out/kernel.py" 2>/dev/null)" == "faster kernel" ]] || fail "output/ lacks the edited kept file"
  [[ "$(cat "$out/notes.md" 2>/dev/null)" == "my notes" ]] || fail "output/ lacks the agent's new file"
  # The upstream has no licence: nothing it shipped except the kept file may be committed.
  listing=$(cd "$out" 2>/dev/null && find . -mindepth 1 | sort | tr '\n' ' ')
  [[ "$listing" == "./.upstream_changes.json ./kernel.py ./notes.md " ]] || fail "perf output/ held: '$listing'"
}

test_perf_manifest_records_every_change_to_the_upstream() {
  stub_claude_body "$PERF_EDITS"
  run_one perf stub-perf sonnet 1
  local manifest="$RUNS_DIR/$PERF_RUN/output/.upstream_changes.json"
  [[ -f "$manifest" ]] || { fail "no .upstream_changes.json"; return; }
  assert_field "$manifest" modified '["kernel.py", "sim.py"]'
  assert_field "$manifest" added '["notes.md", "spec/mine.py"]'
  assert_field "$manifest" deleted '["spec/frozen.py"]'
}

test_github_fetch_in_perf_is_external() {
  # fetch.sh clones the upstream before the agent starts, and published
  # solutions live on GitHub, so perf gets no GitHub exception.
  claude_events "$(bash_tool_use 'curl -sL https://github.com/someone/perf-solution')"
  run_one perf stub-perf sonnet 1
  assert_field "$RUNS_DIR/$PERF_RUN/result.json" external_fetches '["https://github.com/someone/perf-solution"]'
}

# --- isolation -------------------------------------------------------------

test_codex_home_holds_only_auth_and_config() {
  stub_codex
  run_one takehome stub-task codex 1
  local listing
  listing=$(tr '\n' ' ' 2>/dev/null < "$RUNS_DIR/$CODEX_RUN/output/codex-home.txt")
  [[ "$listing" == "auth.json config.toml " ]] || fail "CODEX_HOME held: '$listing'"
}

test_codex_config_pins_model_effort_and_network_and_disables_web_search_and_apps() {
  stub_codex
  run_one takehome stub-task codex 1
  local expected
  expected=$(printf 'model = "gpt-6-sol"\nmodel_reasoning_effort = "high"\nweb_search = "disabled"\n\n[features]\napps = false\n\n[sandbox_workspace_write]\nnetwork_access = true')
  [[ "$(cat "$RUNS_DIR/$CODEX_RUN/output/codex-config.toml" 2>/dev/null)" == "$expected" ]] \
    || fail "config.toml was: '$(cat "$RUNS_DIR/$CODEX_RUN/output/codex-config.toml" 2>/dev/null)'"
}

test_codex_config_turns_off_app_connectors() {
  stub_codex
  run_one takehome stub-task codex 1
  local apps
  apps=$(python3 -c 'import sys, tomllib; print(tomllib.load(open(sys.argv[1], "rb"))["features"]["apps"])' \
    "$RUNS_DIR/$CODEX_RUN/output/codex-config.toml" 2>&1)
  [[ "$apps" == "False" ]] || fail "features.apps was: '$apps'"
}

test_codex_credential_copy_is_removed_after_the_run() {
  stub_codex
  run_one takehome stub-task codex 1
  local left
  left=$(grep -rlF "$CREDENTIAL" "$TMPDIR" 2>/dev/null | grep -v "^$SANDBOX/home/" || true)
  [[ -z "$left" ]] || fail "credential copy left behind: $left"
}

test_claude_container_mounts_only_the_run_work_dir() {
  stub_claude
  run_one takehome stub-task sonnet 1
  local mounts source
  mounts=$(docker_option_values -v | tr '\n' ' ')
  [[ "$mounts" == *":/work " && "$mounts" != *" "*" "* ]] || { fail "container mounts: '$mounts'"; return; }
  # The mount's host side must be the directory the agent actually worked in
  # (gone now, so resolved without cd).
  source=$(python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "${mounts%:/work }")
  [[ -n "$source" && "$source" == "$(cat "$RUNS_DIR/$RUN/output/cwd.txt" 2>/dev/null)" ]] || fail "/work is not the agent's work dir: '$mounts'"
  [[ "$(docker_option_values --workdir)" == "/work" ]] || fail "--workdir was '$(docker_option_values --workdir)'"
}

test_container_gets_no_other_host_access_and_uses_the_runs_network() {
  stub_claude
  run_one takehome stub-task sonnet 1
  local found
  found=$(agent_docker_args | grep -x -E -e '--(mount|volume|volumes-from|privileged|cap-add|device|pid|ipc|userns)(=.*)?' -e '.*docker\.sock.*')
  [[ -z "$found" ]] || fail "docker run was given: $found"
  [[ "$(docker_option_values --network)" == "interview-signal-runs" ]] || fail "--network was '$(docker_option_values --network)'"
}

test_container_has_memory_and_cpu_limits() {
  stub_claude
  run_one takehome stub-task sonnet 1
  [[ "$(docker_option_values --memory)" == "4g" ]] || fail "--memory was '$(docker_option_values --memory)'"
  [[ "$(docker_option_values --cpus)" == "2" ]] || fail "--cpus was '$(docker_option_values --cpus)'"
}

test_every_agent_runs_as_candidate_in_the_agent_image() {
  local agent
  stub_claude
  stub_codex
  for agent in sonnet codex; do
    rm -f "$SANDBOX/docker/calls.jsonl"
    run_one takehome stub-task "$agent" 1
    [[ "$(docker_option_values --user)" == "candidate" ]] || fail "$agent ran as '$(docker_option_values --user)'"
    agent_docker_args | grep -qx interview-signal-agent || fail "$agent did not run in the interview-signal-agent image"
  done
}

test_claude_container_env_is_utc_and_the_token_name_only() {
  stub_claude
  run_one takehome stub-task sonnet 1
  [[ "$(docker_option_values -e | tr '\n' ' ')" == "TZ=UTC CLAUDE_CODE_OAUTH_TOKEN " ]] || fail "-e was: '$(docker_option_values -e | tr '\n' ' ')'"
}

test_claude_token_reaches_the_container_by_env_and_no_argument() {
  stub_claude_body "[[ \"\$CLAUDE_CODE_OAUTH_TOKEN\" == '$CLAUDE_TOKEN' ]] && echo yes > token-seen.txt"
  run_one takehome stub-task sonnet 1
  [[ "$(cat "$RUNS_DIR/$RUN/output/token-seen.txt" 2>/dev/null)" == "yes" ]] || fail "the agent did not get the token"
  grep -qF "$CLAUDE_TOKEN" <(python3 -c 'import json, sys
for line in open(sys.argv[1]):
    print("\n".join(json.loads(line)["args"]))' "$SANDBOX/docker/calls.jsonl") && fail "the token appeared in a docker argument"
}

test_claude_token_is_in_no_file_the_container_can_see() {
  # The agent's cwd is the host side of /work, so .. is the whole run root.
  stub_claude_body 'grep -rlF "$CLAUDE_CODE_OAUTH_TOKEN" .. > token-files.txt; echo searched > searched.txt'
  run_one takehome stub-task sonnet 1
  [[ -f "$RUNS_DIR/$RUN/output/searched.txt" ]] || { fail "stub did not search"; return; }
  [[ ! -s "$RUNS_DIR/$RUN/output/token-files.txt" ]] || fail "token written to: $(cat "$RUNS_DIR/$RUN/output/token-files.txt")"
}

test_missing_claude_token_file_stops_the_run_unstarted() {
  stub_claude
  rm "$TOKEN_FILE"
  local err
  err=$("$REPO/run.sh" --one takehome stub-task sonnet 1 2>&1 >/dev/null) && fail "run.sh ran without a token file"
  [[ "$err" == *"$TOKEN_FILE"* ]] || fail "stderr did not name the token file: $err"
  [[ ! -e "$RUNS_DIR/$RUN" ]] || fail "run directory created for a run that never started"
}

test_claude_token_file_readable_by_others_stops_the_run_unstarted() {
  stub_claude
  chmod 644 "$TOKEN_FILE"
  local err
  err=$("$REPO/run.sh" --one takehome stub-task sonnet 1 2>&1 >/dev/null) && fail "run.sh ran with a mode 644 token file"
  [[ "$err" == *"644"* ]] || fail "stderr did not give the mode: $err"
  [[ ! -e "$RUNS_DIR/$RUN" ]] || fail "run directory created for a run that never started"
}

test_codex_run_needs_no_claude_token_file() {
  stub_codex
  rm "$TOKEN_FILE"
  run_one takehome stub-task codex 1 || fail "codex run failed without the Claude token file"
  [[ -f "$RUNS_DIR/$CODEX_RUN/result.json" ]] || fail "no result.json"
}

test_codex_container_mounts_the_work_dir_and_its_scratch_codex_home() {
  stub_codex
  run_one takehome stub-task codex 1
  local targets
  targets=$(docker_option_values -v | sed 's/.*://' | tr '\n' ' ')
  [[ "$targets" == "/work /codex " ]] || fail "container mounts: '$targets'"
  # The stub saw auth.json and config.toml through CODEX_HOME, so /codex is its scratch home.
  [[ "$(tr '\n' ' ' < "$RUNS_DIR/$CODEX_RUN/output/codex-home.txt" 2>/dev/null)" == "auth.json config.toml " ]] || fail "CODEX_HOME was not the mounted scratch home"
}

test_codex_runs_without_its_own_sandbox_inside_the_container() {
  # Codex's workspace-write sandbox needs bwrap, which cannot make a user
  # namespace in the container; the container is the boundary instead.
  stub_codex
  run_one takehome stub-task codex 1
  local command
  command=$(agent_docker_args | sed -n '/^interview-signal-agent$/,$p' | sed '1d;$d' | tr '\n' ' ')
  [[ "$command" == "codex exec --skip-git-repo-check --sandbox danger-full-access --json " ]] || fail "codex command was: '$command'"
}

test_codex_container_env_is_utc_and_codex_home_only() {
  stub_codex
  run_one takehome stub-task codex 1
  [[ "$(docker_option_values -e | tr '\n' ' ')" == "TZ=UTC CODEX_HOME=/codex " ]] || fail "-e was: '$(docker_option_values -e | tr '\n' ' ')'"
}

test_no_docker_argument_names_a_host_home_path() {
  local agent found
  stub_claude
  stub_codex
  for agent in sonnet codex; do
    run_one takehome stub-task "$agent" 1
  done
  found=$(python3 -c 'import json, sys
for line in open(sys.argv[1]):
    print("\n".join(json.loads(line)["args"]))' "$SANDBOX/docker/calls.jsonl" | grep -F -e "$HOME" -e "$ORIGINAL_HOME")
  [[ -z "$found" ]] || fail "docker was given host HOME paths: $found"
}

test_missing_image_stops_the_run_unstarted() {
  stub_claude
  rm "$SANDBOX/docker/image"
  local err
  err=$("$REPO/run.sh" --one takehome stub-task sonnet 1 2>&1 >/dev/null) && fail "run.sh ran without the image"
  [[ "$err" == *"--build-image"* ]] || fail "stderr did not say how to build the image: $err"
  [[ ! -e "$RUNS_DIR/$RUN" ]] || fail "run directory created for a run that never started"
  [[ -z "$(agent_docker_args)" ]] || fail "the agent container was started"
}

test_work_dir_docker_cannot_see_stops_the_run_unstarted() {
  stub_claude
  touch "$SANDBOX/docker/unshared"
  local err
  err=$("$REPO/run.sh" --one takehome stub-task sonnet 1 2>&1 >/dev/null) && fail "run.sh ran with a mount the container cannot see"
  [[ "$err" == *"SCRATCH_DIR"* ]] || fail "stderr did not say what to change: $err"
  [[ ! -e "$RUNS_DIR/$RUN" ]] || fail "run directory created for a run that never started"
  [[ -z "$(ls -A "$SCRATCH_DIR" 2>/dev/null)" ]] || fail "run root left behind: $(ls -A "$SCRATCH_DIR")"
}

test_run_root_is_removed_after_the_run() {
  stub_codex
  run_one takehome stub-task codex 1
  [[ -f "$RUNS_DIR/$CODEX_RUN/result.json" ]] || { fail "no result.json"; return; }
  [[ -z "$(ls -A "$SCRATCH_DIR" 2>/dev/null)" ]] || fail "run root left behind: $(ls -A "$SCRATCH_DIR")"
}

test_cli_version_is_the_one_in_the_image() {
  stub_claude
  run_one takehome stub-task sonnet 1
  python3 -c 'import json, sys
calls = [json.loads(l)["args"] for l in open(sys.argv[1])]
sys.exit(0 if any(c[0] == "run" and c[-3:] == ["interview-signal-agent", "claude", "--version"] for c in calls) else 1)' "$SANDBOX/docker/calls.jsonl" \
    || fail "claude --version was not run in the image"
}

test_build_image_pins_the_host_cli_versions() {
  stub_claude
  stub_codex
  "$REPO/run.sh" --build-image >/dev/null 2>&1 || fail "--build-image exited non-zero"
  local build
  build=$(python3 -c 'import json, sys
for line in open(sys.argv[1]):
    args = json.loads(line)["args"]
    if args[0] == "build":
        print(" ".join(args))' "$SANDBOX/docker/calls.jsonl")
  [[ "$build" == "build --build-arg CLAUDE_CODE_VERSION=9.9.9 --build-arg CODEX_VERSION=0.0.1 -t interview-signal-agent $REPO/docker" ]] || fail "docker build was: '$build'"
}

# The value of a variadic flag: the arguments after it up to the next flag.
flag_values() { # flag_values <args file, one per line> <flag>
  awk -v flag="$2" '$0 == flag { on = 1; next } on && /^--/ { exit } on { printf "%s ", $0 }' "$1"
}

test_claude_is_offered_only_the_candidate_tool_set() {
  stub_claude_body 'printf "%s\n" "$@" > args.txt'
  run_one takehome stub-task sonnet 1
  local args="$RUNS_DIR/$RUN/output/args.txt"
  [[ "$(flag_values "$args" --tools)" == "Bash Edit Glob Grep Read Write TodoWrite Task " ]] || fail "--tools was: '$(flag_values "$args" --tools)'"
  [[ "$(flag_values "$args" --allowedTools)" == "Read Write Edit Glob Grep Bash " ]] || fail "--allowedTools was: '$(flag_values "$args" --allowedTools)'"
  [[ "$(flag_values "$args" --disallowedTools)" == "WebSearch WebFetch Workflow RemoteTrigger SendMessage " ]] || fail "--disallowedTools was: '$(flag_values "$args" --disallowedTools)'"
}

test_claude_loads_no_mcp_server_from_any_config() {
  # Without this, a logged-in session connects the operator's claude.ai
  # connectors (Slack among them) even with a scratch HOME.
  stub_claude_body 'printf "%s\n" "$@" > args.txt'
  run_one takehome stub-task sonnet 1
  grep -qx -- '--strict-mcp-config' "$RUNS_DIR/$RUN/output/args.txt" 2>/dev/null || fail "--strict-mcp-config not passed"
}

test_agent_sees_utc_and_its_workspace_as_pwd() {
  stub_claude_body 'echo "$TZ" > tz.txt; echo "$PWD" > pwd.txt; pwd > cwd.txt'
  TZ=Australia/Perth run_one takehome stub-task sonnet 1
  local out="$RUNS_DIR/$RUN/output"
  [[ "$(cat "$out/tz.txt" 2>/dev/null)" == "UTC" ]] || fail "TZ was '$(cat "$out/tz.txt" 2>/dev/null)'"
  [[ "$(cat "$out/pwd.txt" 2>/dev/null)" == "$(cat "$out/cwd.txt" 2>/dev/null)" ]] || fail "PWD does not name the workspace"
}

# --- network isolation -----------------------------------------------------

# The arguments of the preflight container run, one per line.
preflight_args() {
  python3 -c 'import json, sys
for line in open(sys.argv[1]):
    args = json.loads(line)["args"]
    if args[:1] == ["run"] and "preflight" in args:
        print("\n".join(args))
        break' "$SANDBOX/docker/calls.jsonl"
}

assert_stopped_unstarted() { # assert_stopped_unstarted <stderr> <expected words>
  [[ "$1" == *"$2"* ]] || fail "stderr did not say '$2': $1"
  [[ ! -e "$RUNS_DIR/$RUN" ]] || fail "run directory created for a run that never started"
  [[ -z "$(agent_docker_args)" ]] || fail "the agent container was started"
}

test_missing_runs_network_stops_the_run_unstarted() {
  stub_claude
  rm "$SANDBOX/docker/network"
  local err
  err=$("$REPO/run.sh" --one takehome stub-task sonnet 1 2>&1 >/dev/null) && fail "run.sh ran without the runs network"
  assert_stopped_unstarted "$err" "--setup-network"
}

test_runs_network_with_inter_container_traffic_stops_the_run_unstarted() {
  stub_claude
  echo "true isig-runs 172.30.9.1 false" > "$SANDBOX/docker/network"
  local err
  err=$("$REPO/run.sh" --one takehome stub-task sonnet 1 2>&1 >/dev/null) && fail "run.sh ran on a network with icc on"
  assert_stopped_unstarted "$err" "enable_icc"
}

test_runs_network_with_ipv6_stops_the_run_unstarted() {
  # The firewall rules are IPv4 only, so the network must carry no IPv6.
  stub_claude
  echo "false isig-runs 172.30.9.1 true" > "$SANDBOX/docker/network"
  local err
  err=$("$REPO/run.sh" --one takehome stub-task sonnet 1 2>&1 >/dev/null) && fail "run.sh ran on a network with IPv6"
  assert_stopped_unstarted "$err" "IPv6"
}

test_preflight_reaching_the_lan_gateway_stops_the_run_unstarted() {
  stub_claude
  echo "10.0.0.1:80" > "$SANDBOX/docker/preflight-open"
  local err
  err=$("$REPO/run.sh" --one takehome stub-task sonnet 1 2>&1 >/dev/null) && fail "run.sh ran with a private address reachable"
  assert_stopped_unstarted "$err" "10.0.0.1:80"
}

test_missing_firewall_rules_stop_the_run_unstarted() {
  stub_claude
  touch "$SANDBOX/colima/no-rules"
  local err
  err=$("$REPO/run.sh" --one takehome stub-task sonnet 1 2>&1 >/dev/null) && fail "run.sh ran without the firewall rules"
  assert_stopped_unstarted "$err" "--setup-network"
}

test_preflight_reaching_the_host_stops_the_run_unstarted() {
  stub_claude
  echo "192.168.5.2:5432" > "$SANDBOX/docker/preflight-open"
  local err
  err=$("$REPO/run.sh" --one takehome stub-task sonnet 1 2>&1 >/dev/null) && fail "run.sh ran with the host's Postgres reachable"
  assert_stopped_unstarted "$err" "192.168.5.2:5432"
}

test_preflight_without_outbound_access_stops_the_run_unstarted() {
  stub_claude
  echo "api.anthropic.com:443" > "$SANDBOX/docker/preflight-closed"
  local err
  err=$("$REPO/run.sh" --one takehome stub-task sonnet 1 2>&1 >/dev/null) && fail "run.sh ran without outbound access"
  assert_stopped_unstarted "$err" "api.anthropic.com:443"
}

test_preflight_probes_the_host_and_vm_from_the_runs_network() {
  stub_claude
  run_one takehome stub-task sonnet 1 || fail "run.sh exited non-zero"
  local args
  args=$(preflight_args | tr '\n' ' ')
  local want
  for want in "--network interview-signal-runs " "--user candidate " " 192.168.5.2:5432 " " 192.168.5.2:22 " " 172.30.9.1:22 " " 192.168.5.1:22 " " 192.168.0.1:80 " " 10.0.0.1:80 " " $(route -n get default | awk '/gateway:/ {print $2}'):80 " " registry.npmjs.org:443 " " api.anthropic.com:443 " " api.openai.com:443 " " chatgpt.com:443 "; do
    [[ "$args" == *"$want"* ]] || fail "preflight lacks '$want': $args"
  done
}

test_setup_network_creates_the_network_without_icc_and_the_firewall() {
  rm "$SANDBOX/docker/network"
  touch "$SANDBOX/colima/no-rules"
  "$REPO/run.sh" --setup-network >/dev/null 2>&1 || fail "--setup-network exited non-zero"
  local create
  create=$(python3 -c 'import json, sys
for line in open(sys.argv[1]):
    args = json.loads(line)["args"]
    if args[:2] == ["network", "create"]:
        print(" ".join(args))' "$SANDBOX/docker/calls.jsonl")
  [[ "$create" == "network create --driver bridge -o com.docker.network.bridge.enable_icc=false -o com.docker.network.bridge.name=isig-runs interview-signal-runs" ]] || fail "network create was: '$create'"
  [[ ! -e "$SANDBOX/colima/no-rules" ]] || fail "firewall was not set up"
}

test_setup_network_twice_creates_one_network() {
  rm "$SANDBOX/docker/network"
  "$REPO/run.sh" --setup-network >/dev/null 2>&1 || fail "first --setup-network failed"
  "$REPO/run.sh" --setup-network >/dev/null 2>&1 || fail "second --setup-network failed"
  [[ "$(grep -c '"network", "create"' "$SANDBOX/docker/calls.jsonl")" == 1 ]] || fail "network created more than once"
}

test_probe_stops_when_the_preflight_reaches_the_host() {
  probe_claude ''
  echo "192.168.5.2:5432" > "$SANDBOX/docker/preflight-open"
  local out
  out=$(probe) && fail "probe ran with the host reachable"
  [[ "$out" == *"192.168.5.2:5432"* ]] || fail "probe said: $out"
  [[ -z "$(agent_docker_args)" ]] || fail "the probe session was started"
}

# --- host side of the work dir ---------------------------------------------

test_planted_links_and_fifos_are_not_copied_and_are_recorded() {
  echo "operator secret" > "$SANDBOX/outside.txt"
  chmod 400 "$SANDBOX/outside.txt"
  stub_claude_body "echo mine > real.txt; ln -s '$SANDBOX/outside.txt' leak.txt; ln -s '$SANDBOX' leakdir; mkfifo pipe; mkdir -p deep && ln -s '$SANDBOX/outside.txt' deep/leak"
  run_one takehome stub-task sonnet 1 || fail "run.sh exited non-zero"
  local out="$RUNS_DIR/$RUN/output"
  [[ "$(cat "$out/real.txt" 2>/dev/null)" == "mine" ]] || fail "output/ lost the agent's real file"
  local name
  for name in leak.txt leakdir pipe deep/leak; do
    [[ ! -e "$out/$name" && ! -L "$out/$name" ]] || fail "output/ holds $name"
  done
  grep -rqF "operator secret" "$RUNS_DIR/$RUN" && fail "the linked file's content reached the run directory"
  assert_field "$RUNS_DIR/$RUN/result.json" skipped_links '["deep/leak", "leak.txt", "leakdir", "pipe"]'
  [[ "$(stat -f '%Lp' "$SANDBOX/outside.txt")" == "400" ]] || fail "the linked file's mode was changed"
}

test_clean_run_records_no_skipped_links() {
  stub_claude
  run_one takehome stub-task sonnet 1
  assert_field "$RUNS_DIR/$RUN/result.json" skipped_links '[]'
}

test_perf_link_is_neither_read_nor_copied() {
  echo "operator secret" > "$SANDBOX/outside.txt"
  stub_claude_body "rm kernel.py; ln -s '$SANDBOX/outside.txt' kernel.py; ln -s '$SANDBOX/outside.txt' notes.md"
  run_one perf stub-perf sonnet 1 || fail "run.sh exited non-zero"
  local out="$RUNS_DIR/$PERF_RUN/output"
  [[ ! -e "$out/kernel.py" && ! -e "$out/notes.md" ]] || fail "perf output/ holds a linked file"
  grep -rqF "operator secret" "$RUNS_DIR/$PERF_RUN" && fail "the linked file's content reached the run directory"
  assert_field "$out/.upstream_changes.json" deleted '["kernel.py"]'
  assert_field "$RUNS_DIR/$PERF_RUN/result.json" skipped_links '["kernel.py", "notes.md"]'
}

test_files_the_agent_made_unreadable_are_copied_and_cleaned_up() {
  stub_claude_body 'echo locked > locked.txt; chmod 000 locked.txt; mkdir sealed; echo inside > sealed/f; chmod 000 sealed'
  run_one takehome stub-task sonnet 1 || fail "run.sh exited non-zero"
  [[ "$(cat "$RUNS_DIR/$RUN/output/locked.txt" 2>/dev/null)" == "locked" ]] || fail "unreadable file not copied"
  [[ "$(cat "$RUNS_DIR/$RUN/output/sealed/f" 2>/dev/null)" == "inside" ]] || fail "file in an unreadable dir not copied"
  [[ -z "$(ls -A "$SCRATCH_DIR" 2>/dev/null)" ]] || fail "run root left behind: $(ls -A "$SCRATCH_DIR")"
}

test_claude_token_file_that_is_a_symlink_stops_the_run_unstarted() {
  stub_claude
  mv "$TOKEN_FILE" "$SANDBOX/real-token"
  ln -s "$SANDBOX/real-token" "$TOKEN_FILE"
  local err
  err=$("$REPO/run.sh" --one takehome stub-task sonnet 1 2>&1 >/dev/null) && fail "run.sh followed a symlinked token file"
  assert_stopped_unstarted "$err" "symlink"
}

# --- stale run roots -------------------------------------------------------

dead_pid() { sleep 0 & local pid=$!; wait "$pid"; echo "$pid"; }

stale_root() { # stale_root <name> <owner pid|""> -> makes $SCRATCH_DIR/<name> holding a work file
  mkdir -p "$SCRATCH_DIR/$1/work"
  echo left > "$SCRATCH_DIR/$1/work/file"
  [[ -z "$2" ]] || echo "$2" > "$SCRATCH_DIR/$1/owner"
}

test_run_root_whose_runner_died_is_swept_at_startup() {
  stub_claude
  stale_root run.dead "$(dead_pid)"
  chmod 000 "$SCRATCH_DIR/run.dead/work"
  run_one takehome stub-task sonnet 1
  [[ ! -e "$SCRATCH_DIR/run.dead" ]] || fail "stale root kept"
}

test_run_root_of_a_live_runner_is_kept() {
  stub_claude
  stale_root run.live "$$"
  run_one takehome stub-task sonnet 1
  [[ -e "$SCRATCH_DIR/run.live/work/file" ]] || fail "a live runner's root was swept"
}

test_run_root_whose_container_still_runs_is_kept() {
  stub_claude
  stale_root run.busy "$(dead_pid)"
  echo "$$" > "$SANDBOX/docker/interview-signal-run.busy.pid"
  run_one takehome stub-task sonnet 1
  [[ -e "$SCRATCH_DIR/run.busy/work/file" ]] || fail "a root whose container runs was swept"
}

test_old_run_root_without_an_owner_is_swept() {
  stub_claude
  stale_root run.orphan ""
  touch -t 202001010000 "$SCRATCH_DIR/run.orphan"
  run_one takehome stub-task sonnet 1
  [[ ! -e "$SCRATCH_DIR/run.orphan" ]] || fail "old ownerless root kept"
}

test_new_run_root_without_an_owner_is_kept() {
  stub_claude
  stale_root run.fresh ""
  run_one takehome stub-task sonnet 1
  [[ -e "$SCRATCH_DIR/run.fresh/work/file" ]] || fail "a root still being made was swept"
}

# --- process control -------------------------------------------------------

test_existing_result_json_skips_the_run() {
  stub_claude
  mkdir -p "$RUNS_DIR/$RUN"
  echo '{"sentinel": true}' > "$RUNS_DIR/$RUN/result.json"
  run_one takehome stub-task sonnet 1 || fail "run.sh exited non-zero on skip"
  [[ "$(cat "$RUNS_DIR/$RUN/result.json")" == '{"sentinel": true}' ]] || fail "existing result.json was overwritten"
  [[ ! -e "$RUNS_DIR/$RUN/transcript.jsonl" ]] || fail "agent ran despite existing result.json"
}

test_run_already_in_progress_is_refused() {
  stub_claude
  mkdir -p "$RUNS_DIR/$RUN.lock"
  run_one takehome stub-task sonnet 1 && fail "run.sh started a run whose lock is held"
  [[ ! -e "$RUNS_DIR/$RUN/transcript.jsonl" ]] || fail "agent ran despite the lock"
  [[ -d "$RUNS_DIR/$RUN.lock" ]] || fail "someone else's lock was removed"
}

test_finished_run_releases_its_lock() {
  stub_claude
  run_one takehome stub-task sonnet 1
  [[ ! -e "$RUNS_DIR/$RUN.lock" ]] || fail "lock left behind"
}

test_run_over_wall_clock_is_killed_and_recorded_as_error() {
  stub_claude_body 'exec sleep 60'
  local start=$SECONDS
  WALL_S=1 run_one takehome stub-task sonnet 1
  (( SECONDS - start < 20 )) || fail "run was not stopped at the wall-clock cap"
  local result="$RUNS_DIR/$RUN/result.json"
  [[ -f "$result" ]] || { fail "no result.json after timeout"; return; }
  assert_field "$result" is_error 'true'
  assert_field "$result" timed_out 'true'
}

test_timeout_kills_processes_the_agent_spawned() {
  stub_claude_body "sleep 60 & echo \$! > '$SANDBOX/child_pid'; wait"
  WALL_S=1 run_one takehome stub-task sonnet 1
  assert_dead "$SANDBOX/child_pid" "the agent's child"
}

test_timeout_kills_the_container_the_run_started() {
  stub_claude_body 'exec sleep 60'
  WALL_S=1 run_one takehome stub-task sonnet 1
  local name
  name=$(docker_option_values --name)
  [[ -n "$name" ]] || { fail "the agent container was not named"; return; }
  grep -qF "{\"args\": [\"kill\", \"$name\"]" "$SANDBOX/docker/calls.jsonl" || fail "docker kill $name was not called"
}

test_interrupting_the_runner_kills_the_agent() {
  stub_claude_body "sleep 60 & echo \$! > '$SANDBOX/child_pid'; wait"
  set -m
  "$REPO/run.sh" --one takehome stub-task sonnet 1 >/dev/null 2>&1 &
  local group=$!
  set +m
  wait_for_file "$SANDBOX/child_pid" || { kill -9 -- "-$group"; fail "agent never started"; return; }
  kill -TERM -- "-$group"
  wait "$group"
  assert_dead "$SANDBOX/child_pid" "the agent's child"
  assert_field "$RUNS_DIR/$RUN/result.json" interrupted '"SIGTERM"'
  [[ ! -e "$RUNS_DIR/$RUN.lock" ]] || fail "an interrupted run kept its lock"
}

test_sigterm_to_the_runner_alone_kills_the_agent_and_keeps_the_run() {
  stub_claude_body "echo partial > partial.txt; sleep 60 & echo \$! > '$SANDBOX/child_pid'; wait"
  "$REPO/run.sh" --one takehome stub-task sonnet 1 >/dev/null 2>&1 &
  local runner=$! start=$SECONDS code=0
  wait_for_file "$SANDBOX/child_pid" || { kill -9 "$runner"; fail "agent never started"; return; }
  kill -TERM "$runner"
  wait "$runner" || code=$?
  (( SECONDS - start < 15 )) || fail "runner took $((SECONDS - start))s to stop"
  (( code == 143 )) || fail "runner exited $code, expected 143"
  assert_dead "$SANDBOX/child_pid" "the agent's child"
  local result="$RUNS_DIR/$RUN/result.json"
  [[ -f "$result" ]] || { fail "the interrupted paid run was not recorded"; return; }
  assert_field "$result" is_error 'true'
  assert_field "$result" interrupted '"SIGTERM"'
  [[ "$(cat "$RUNS_DIR/$RUN/output/partial.txt" 2>/dev/null)" == "partial" ]] || fail "output/ lost the agent's work"
  [[ ! -e "$RUNS_DIR/$RUN.lock" ]] || fail "an interrupted run kept its lock"
}

test_batch_mode_runs_every_requested_rep() {
  stub_claude
  FORMATS=takehome TASKS=stub-task AGENTS=sonnet REPS=2 JOBS=2 "$REPO/run.sh" >/dev/null 2>&1 || fail "batch run exited non-zero"
  [[ -f "$RUNS_DIR/takehome__stub-task__sonnet__r1/result.json" ]] || fail "r1 missing"
  [[ -f "$RUNS_DIR/takehome__stub-task__sonnet__r2/result.json" ]] || fail "r2 missing"
  [[ ! -e "$RUNS_DIR/takehome__stub-task__sonnet__r3" ]] || fail "ran more reps than requested"
}

# --- probe.sh --------------------------------------------------------------

# The probe's commands run inside the container, which a stub on this host
# cannot be, so the probe stubs answer each bracketed command the prompt
# names with $SANDBOX/sections/<name>. The defaults are what the agent image
# prints; a test overwrites one to play a leak.
probe_sections() {
  mkdir -p "$SANDBOX/sections"
  printf 'bash: line 1: gh: command not found\nexit=127\n' > "$SANDBOX/sections/gh"
  printf 'user.name=Candidate\nuser.email=candidate@example.invalid\ncommit.gpgsign=false\nexit=0\n' > "$SANDBOX/sections/git"
  printf "ls: cannot access '/home/candidate/.ssh': No such file or directory\nexit=2\n" > "$SANDBOX/sections/ssh"
  printf 'bash: line 4: ssh: command not found\nexit=127\n' > "$SANDBOX/sections/github"
  printf "ls: cannot access '/Users': No such file or directory\nexit=2\n" > "$SANDBOX/sections/users"
}

section() { printf '%s\n' "$2" > "$SANDBOX/sections/$1"; } # section <name> <what it printed, exit line last>

# Prints the stub's answer to the <command> in the prompt $1.
cat_sections() {
  python3 - "$1" "$SANDBOX/sections" <<'PY'
import os, re, sys
m = re.search(r"<command>\s*(.*?)\s*</command>", sys.argv[1], re.S)
for name in re.findall(r"echo '<<(\w+)'", m.group(1) if m else ""):
    print(f"<<{name}")
    print(open(os.path.join(sys.argv[2], name)).read(), end="")
    print(">>")
PY
}

# A Claude stub for the probe: answers the <command> through its Bash tool,
# then quotes the CLAUDE.md in its working directory (as a session that
# loaded it would) and says whatever $1 adds. $2 is the init event's
# mcp_servers and $3 its tools.
probe_claude() {
  local mcp=${2:-[]} tools=${3:-'["Task","Bash","Edit","Glob","Grep","Read","Write"]'}
  probe_sections
  cat > "$SANDBOX/bin/claude" <<EOF
#!/usr/bin/env bash
$(declare -f cat_sections | sed "s|\$SANDBOX|$SANDBOX|g")
command=\$(python3 -c 'import re,sys; m = re.search(r"<command>\s*(.*?)\s*</command>", sys.argv[1], re.S); print(m.group(1) if m else "")' "\$2")
output=\$(cat_sections "\$2")
text=\$(cat CLAUDE.md 2>/dev/null; printf '%s' '$1')
python3 - "\$command" "\$output" "\$text" <<'PY2'
import json, sys
command, output, text = sys.argv[1:4]
print(json.dumps({"type": "system", "subtype": "init", "model": "stub", "mcp_servers": $mcp, "tools": $tools}))
if command:
    print(json.dumps({"type": "assistant", "message": {"content": [{"type": "tool_use", "id": "t1", "name": "Bash", "input": {"command": command}}]}}))
    print(json.dumps({"type": "user", "message": {"content": [{"type": "tool_result", "tool_use_id": "t1", "content": output}]}}))
print(json.dumps({"type": "result", "is_error": False, "num_turns": 2, "total_cost_usd": 0.0, "result": text + "\n" + output}))
PY2
EOF
  chmod +x "$SANDBOX/bin/claude"
}

# The Codex counterpart: answers the <command> as a command_execution item,
# quotes its AGENTS.md and gives $2 (default: the no-GitHub-tool answer) as
# its GitHub answer. $1 is extra shell run before the turn completes, such as
# more event lines.
probe_codex() {
  local extra=${1:-} github=${2-NO GITHUB TOOL}
  probe_sections
  cat > "$SANDBOX/bin/codex" <<EOF
#!/usr/bin/env bash
$(declare -f cat_sections | sed "s|\$SANDBOX|$SANDBOX|g")
prompt=\${@: -1}
command=\$(python3 -c 'import re,sys; m = re.search(r"<command>\s*(.*?)\s*</command>", sys.argv[1], re.S); print(m.group(1) if m else "")' "\$prompt")
output=\$(cat_sections "\$prompt")
python3 - "\$command" "\$output" "\$(cat AGENTS.md)" '$github' <<'PY2'
import json, sys
command, output, agents_md, github = sys.argv[1:5]
print(json.dumps({"type": "item.completed", "item": {"type": "command_execution", "command": command, "aggregated_output": output, "exit_code": 0}}))
print(json.dumps({"type": "item.completed", "item": {"type": "agent_message", "text": agents_md + "\n" + output + "\n" + github}}))
PY2
$extra
echo '{"type":"turn.completed","usage":{}}'
EOF
  chmod +x "$SANDBOX/bin/codex"
}

probe() { AGENTS=${AGENTS:-sonnet} "$REPO/probe.sh" 2>&1; }

test_probe_passes_an_agent_that_quotes_only_the_canary() {
  probe_claude ''
  local out
  out=$(probe) || fail "probe failed: $out"
  [[ "$out" == *"sonnet clean"* ]] || fail "probe said: $out"
}

test_probe_runs_each_session_in_the_agent_container() {
  probe_claude ''
  probe >/dev/null
  agent_docker_args | grep -qx interview-signal-agent || fail "the probe session did not run in the agent image"
  [[ "$(docker_option_values --user)" == "candidate" ]] || fail "the probe session ran as '$(docker_option_values --user)'"
}

test_probe_fails_an_agent_that_quotes_operator_instructions() {
  probe_claude 'No abstraction until the third caller'
  local out
  out=$(probe) && fail "probe passed a leak"
  [[ "$out" == *"sonnet leak"* ]] || fail "probe said: $out"
}

test_probe_matches_a_leak_despite_changed_punctuation() {
  probe_claude 'Duplication is cheaper than the wrong-shape'
  local out
  out=$(probe) && fail "probe passed a leak: $out"
  [[ "$out" == *"sonnet leak"* ]] || fail "probe said: $out"
}

test_probe_fails_an_agent_that_does_not_quote_the_canary() {
  stub_claude_body 'echo "{\"type\":\"result\",\"is_error\":false,\"result\":\"NONE\"}"'
  local out
  out=$(probe) && fail "probe passed without the positive control"
  [[ "$out" == *"canary"* ]] || fail "probe said: $out"
}

test_probe_fails_a_session_with_mcp_servers() {
  probe_claude '' '[{"name":"slack","status":"connected"}]'
  local out
  out=$(probe) && fail "probe passed a session with MCP servers"
  [[ "$out" == *"mcp"* ]] || fail "probe said: $out"
}

test_probe_passes_codex_quoting_only_its_agents_md_canary() {
  probe_codex
  local out
  out=$(AGENTS=codex probe) || fail "probe failed: $out"
  [[ "$out" == *"codex clean"* ]] || fail "probe said: $out"
}

test_probe_fails_codex_that_searched_the_web() {
  probe_codex "echo '{\"type\":\"item.completed\",\"item\":{\"id\":\"ws\",\"type\":\"web_search\",\"query\":\"q\"}}'"
  local out
  out=$(AGENTS=codex probe) && fail "probe passed a session that searched the web"
  [[ "$out" == *"web_search"* ]] || fail "probe said: $out"
}

test_probe_fails_codex_that_calls_a_codex_apps_tool() {
  probe_codex "echo '{\"type\":\"item.completed\",\"item\":{\"id\":\"a1\",\"type\":\"mcp_tool_call\",\"server\":\"codex_apps\",\"tool\":\"github.get_user_login\",\"status\":\"completed\"}}'"
  local out
  out=$(AGENTS=codex probe) && fail "probe passed a session that called a codex_apps tool"
  [[ "$out" == *"codex_apps"* ]] || fail "probe said: $out"
}

test_probe_fails_codex_that_was_offered_codex_apps_tools() {
  probe_codex 'mkdir -p "$CODEX_HOME/cache/codex_apps_tools"; echo '"'"'{"schema_version":1,"tools":[{"server_name":"codex_apps","tool_namespace":"codex_apps__github","tool_name":"get_user_login"}]}'"'"' > "$CODEX_HOME/cache/codex_apps_tools/x.json"'
  local out
  out=$(AGENTS=codex probe) && fail "probe passed a session offered codex_apps tools"
  [[ "$out" == *"codex_apps__github"* ]] || fail "probe said: $out"
}

test_probe_fails_codex_that_does_not_say_it_has_no_github_tool() {
  probe_codex '' 'The signed-in account is someone.'
  local out
  out=$(AGENTS=codex probe) && fail "probe passed a session that did not deny having a GitHub tool"
  [[ "$out" == *"GitHub tool"* ]] || fail "probe said: $out"
}

test_probe_passes_a_session_whose_gh_is_not_logged_in() {
  probe_claude ''
  section gh $'You are not logged into any GitHub hosts. To log in, run: gh auth login\nexit=1'
  local out
  out=$(probe) || fail "probe failed: $out"
  [[ "$out" == *"sonnet clean"* ]] || fail "probe said: $out"
}

test_probe_fails_an_agent_that_gh_reports_logged_in() {
  probe_claude ''
  section gh $'github.com\n  Logged in to github.com account someone (keyring)\nexit=0'
  local out
  out=$(probe) && fail "probe passed a session with a gh login"
  [[ "$out" == *"gh auth status"* ]] || fail "probe said: $out"
}

test_probe_fails_an_agent_whose_global_git_config_has_other_keys() {
  probe_claude ''
  section git $'user.name=Candidate\nuser.email=candidate@example.invalid\ncommit.gpgsign=false\ncredential.helper=osxkeychain\nexit=0'
  local out
  out=$(probe) && fail "probe passed a session with extra git config"
  [[ "$out" == *"git config"* ]] || fail "probe said: $out"
}

test_probe_fails_an_agent_that_can_list_an_ssh_dir() {
  probe_claude ''
  section ssh $'.\n..\nconfig\nexit=0'
  local out
  out=$(probe) && fail "probe passed a session with ~/.ssh"
  [[ "$out" == *".ssh"* ]] || fail "probe said: $out"
}

test_probe_fails_an_agent_that_ssh_authenticates_to_github() {
  probe_claude ''
  section github $'Hi someone! You\'ve successfully authenticated, but GitHub does not provide shell access.\nexit=1'
  local out
  out=$(probe) && fail "probe passed a session that logged in to GitHub over SSH"
  [[ "$out" == *"git@github.com"* ]] || fail "probe said: $out"
}

test_probe_fails_an_agent_that_can_list_the_host_users() {
  probe_claude ''
  section users $'Shared\nsomeone\nexit=0'
  local out
  out=$(probe) && fail "probe passed a session that sees /Users"
  [[ "$out" == *"/Users"* ]] || fail "probe said: $out"
}

test_probe_fails_a_command_output_without_its_exit_status() {
  probe_claude ''
  section users 'Shared'
  local out
  out=$(probe) && fail "probe passed output it could not judge"
  [[ "$out" == *"no exit status for users"* ]] || fail "probe said: $out"
}

test_probe_fails_an_agent_that_did_not_run_the_isolation_commands() {
  stub_claude_body 'python3 -c "import json,sys; print(json.dumps({\"type\":\"system\",\"subtype\":\"init\",\"mcp_servers\":[],\"tools\":[\"Bash\"]})); print(json.dumps({\"type\":\"result\",\"is_error\":False,\"result\":open(\"CLAUDE.md\").read()}))"'
  local out
  out=$(probe) && fail "probe passed without evidence from the commands"
  [[ "$out" == *"not run"* ]] || fail "probe said: $out"
}

test_probe_fails_a_claude_session_offered_other_tools() {
  probe_claude '' '[]' '["Bash","Read","Monitor"]'
  local out
  out=$(probe) && fail "probe passed a session offered Monitor"
  [[ "$out" == *"Monitor"* ]] || fail "probe said: $out"
}

test_probe_leaves_no_run_roots_behind() {
  probe_claude ''
  probe >/dev/null
  [[ -z "$(ls -A "$SCRATCH_DIR" 2>/dev/null)" ]] || fail "probe left: $(ls -A "$SCRATCH_DIR")"
}

ORIGINAL_PATH="$PATH"
ORIGINAL_HOME="$HOME"
only=${1:-}
for t in $(declare -F | awk '{print $3}' | grep '^test_'); do
  [[ -z "$only" || "$t" == *"$only"* ]] || continue
  echo "$t"
  before=$failures
  setup
  "$t"
  teardown
  export HOME="$ORIGINAL_HOME" PATH="$ORIGINAL_PATH"
  (( failures == before )) && echo "  ok"
done

if (( failures > 0 )); then
  echo "$failures assertion(s) failed"
  exit 1
fi
echo "all passed"
