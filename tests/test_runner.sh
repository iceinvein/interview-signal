#!/usr/bin/env bash
# Drives run.sh against stub agent binaries so the run directory contract can
# be checked without spending money. Run: bash tests/test_runner.sh
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

# Each test gets a clean sandbox: its own runs/ directory, a fake HOME holding
# fake Codex credentials and instructions, and stub agents first on PATH.
setup() {
  SANDBOX=$(mktemp -d)
  export RUNS_DIR="$SANDBOX/runs"
  export TASKS_DIR="$FIXTURE_TASKS"
  export HOME="$SANDBOX/home"
  mkdir -p "$HOME/.codex" "$SANDBOX/bin"
  echo '{"token": "fake"}' > "$HOME/.codex/auth.json"
  echo 'operator instructions that must not leak' > "$HOME/.codex/AGENTS.md"
  export PATH="$SANDBOX/bin:$ORIGINAL_PATH"
  unset WALL_S BUDGET JOBS FORMATS TASKS AGENTS REPS
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
echo '{"type":"system","subtype":"init","model":"claude-stub-1"}'
echo '{"type":"assistant","message":{"content":[{"type":"text","text":"done"}]}}'
echo '{"type":"result","subtype":"success","is_error":false,"num_turns":3,"total_cost_usd":0.25,"usage":{"input_tokens":10,"output_tokens":20}}'
EOF
  chmod +x "$SANDBOX/bin/claude"
}

# A Codex stand-in: records what its CODEX_HOME holds, writes a rollout file
# the way codex does, and prints codex exec --json events.
stub_codex() {
  cat > "$SANDBOX/bin/codex" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == "--version" ]]; then echo "codex-cli 0.0.1"; exit 0; fi
(cd "$CODEX_HOME" && ls -A) > codex-home.txt
mkdir -p "$CODEX_HOME/sessions/2026/01/01"
echo '{"type":"turn_context","payload":{"model":"gpt-stub"}}' > "$CODEX_HOME/sessions/2026/01/01/rollout-x.jsonl"
echo "codex wrote this" > made-by-agent.txt
echo '{"type":"thread.started","thread_id":"t1"}'
echo '{"type":"turn.started"}'
echo '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"done"}}'
echo '{"type":"turn.completed","usage":{"input_tokens":100,"cached_input_tokens":40,"output_tokens":7}}'
EOF
  chmod +x "$SANDBOX/bin/codex"
}

stub_claude_body() { # replaces the stub's behaviour after --version
  printf '#!/usr/bin/env bash\nif [[ "$1" == "--version" ]]; then echo "9.9.9 (Stub Code)"; exit 0; fi\n%s\n' "$1" > "$SANDBOX/bin/claude"
  chmod +x "$SANDBOX/bin/claude"
}

RUN_DIR_NAME="takehome__stub-task__sonnet__r1"

test_claude_run_writes_result_json_from_the_result_event() {
  stub_claude
  "$REPO/run.sh" --one takehome stub-task sonnet 1 >/dev/null 2>&1 || fail "run.sh exited non-zero"
  local result="$RUNS_DIR/$RUN_DIR_NAME/result.json"
  [[ -f "$result" ]] || { fail "no result.json at $result"; return; }
  assert_field "$result" format '"takehome"'
  assert_field "$result" task '"stub-task"'
  assert_field "$result" agent '"sonnet"'
  assert_field "$result" rep '1'
  assert_field "$result" cli '"9.9.9 (Stub Code)"'
  assert_field "$result" model '"claude-stub-1"'
  assert_field "$result" is_error 'false'
  assert_field "$result" cost_usd '0.25'
  assert_field "$result" turns '3'
  python3 -c 'import json,sys; w=json.load(open(sys.argv[1]))["wall_s"]; sys.exit(0 if isinstance(w,(int,float)) and w>=0 else 1)' "$result" \
    || fail "wall_s is not a non-negative number"
}

test_run_directory_keeps_transcript_and_stderr() {
  stub_claude
  "$REPO/run.sh" --one takehome stub-task sonnet 1 >/dev/null 2>&1
  local dir="$RUNS_DIR/$RUN_DIR_NAME"
  grep -q '"type":"result"' "$dir/transcript.jsonl" 2>/dev/null || fail "transcript.jsonl lacks the agent's events"
  [[ -f "$dir/stderr.txt" ]] || fail "stderr.txt missing"
}

test_output_holds_final_workspace_without_node_modules_or_git() {
  stub_claude
  "$REPO/run.sh" --one takehome stub-task sonnet 1 >/dev/null 2>&1
  local out="$RUNS_DIR/$RUN_DIR_NAME/output"
  [[ "$(cat "$out/given.txt" 2>/dev/null)" == "starter file" ]] || fail "output/ lacks the task's workspace file"
  [[ "$(cat "$out/made-by-agent.txt" 2>/dev/null)" == "agent wrote this" ]] || fail "output/ lacks the agent's file"
  [[ ! -e "$out/node_modules" ]] || fail "output/ contains node_modules"
  [[ ! -e "$out/.git" ]] || fail "output/ contains .git"
}

test_agent_runs_in_a_temp_dir_outside_the_repo() {
  stub_claude
  "$REPO/run.sh" --one takehome stub-task sonnet 1 >/dev/null 2>&1
  local cwd repo_real
  cwd=$(cat "$RUNS_DIR/$RUN_DIR_NAME/output/cwd.txt" 2>/dev/null) || { fail "stub did not record its cwd"; return; }
  repo_real=$(cd "$REPO" && pwd -P)
  [[ "$cwd" != "$repo_real"* ]] || fail "agent ran inside the repo: $cwd"
  [[ "$cwd" != "$FIXTURE_TASKS"* ]] || fail "agent ran inside the task directory: $cwd"
}

test_codex_run_records_model_from_rollout_and_token_usage() {
  stub_codex
  "$REPO/run.sh" --one takehome stub-task codex 1 >/dev/null 2>&1 || fail "run.sh exited non-zero"
  local result="$RUNS_DIR/takehome__stub-task__codex__r1/result.json"
  [[ -f "$result" ]] || { fail "no result.json"; return; }
  assert_field "$result" cli '"codex-cli 0.0.1"'
  assert_field "$result" model '"gpt-stub"'
  assert_field "$result" is_error 'false'
  assert_field "$result" cost_usd 'null'
  assert_field "$result" turns '1'
  assert_field "$result" usage '{"input_tokens": 100, "cached_input_tokens": 40, "output_tokens": 7}'
}

test_codex_home_holds_only_auth_and_config() {
  stub_codex
  "$REPO/run.sh" --one takehome stub-task codex 1 >/dev/null 2>&1
  local listing
  listing=$(tr '\n' ' ' 2>/dev/null < "$RUNS_DIR/takehome__stub-task__codex__r1/output/codex-home.txt")
  [[ "$listing" == "auth.json config.toml " ]] || fail "CODEX_HOME held: '$listing'"
}

test_existing_result_json_skips_the_run() {
  stub_claude
  mkdir -p "$RUNS_DIR/$RUN_DIR_NAME"
  echo '{"sentinel": true}' > "$RUNS_DIR/$RUN_DIR_NAME/result.json"
  "$REPO/run.sh" --one takehome stub-task sonnet 1 >/dev/null 2>&1 || fail "run.sh exited non-zero on skip"
  [[ "$(cat "$RUNS_DIR/$RUN_DIR_NAME/result.json")" == '{"sentinel": true}' ]] || fail "existing result.json was overwritten"
  [[ ! -e "$RUNS_DIR/$RUN_DIR_NAME/transcript.jsonl" ]] || fail "agent ran despite existing result.json"
}

test_run_over_wall_clock_is_killed_and_recorded_as_error() {
  stub_claude_body 'exec sleep 60'
  local start=$SECONDS
  WALL_S=1 "$REPO/run.sh" --one takehome stub-task sonnet 1 >/dev/null 2>&1
  (( SECONDS - start < 20 )) || fail "run was not stopped at the wall-clock cap"
  local result="$RUNS_DIR/$RUN_DIR_NAME/result.json"
  [[ -f "$result" ]] || { fail "no result.json after timeout"; return; }
  assert_field "$result" is_error 'true'
  assert_field "$result" timed_out 'true'
}

test_timeout_kills_processes_the_agent_spawned() {
  stub_claude_body 'sleep 60 & echo $! > "$PWD.child_pid"; wait'
  WALL_S=1 "$REPO/run.sh" --one takehome stub-task sonnet 1 >/dev/null 2>&1
  local pid_file child
  pid_file=$(ls "$TMPDIR"/*.child_pid 2>/dev/null | head -1)
  [[ -n "$pid_file" ]] || { fail "stub did not record its child"; return; }
  child=$(cat "$pid_file")
  rm -f "$pid_file"
  if kill -0 "$child" 2>/dev/null; then
    kill "$child"
    fail "agent's child process $child outlived the timeout"
  fi
}

test_perf_output_keeps_only_candidate_files_not_upstream() {
  stub_claude_body 'echo "faster kernel" > perf_takehome.py; echo "my notes" > notes.md; echo "edited" > problem.py; echo "new test" > tests/mine.py'
  "$REPO/run.sh" --one perf stub-perf sonnet 1 >/dev/null 2>&1 || fail "run.sh exited non-zero"
  local out="$RUNS_DIR/perf__stub-perf__sonnet__r1/output"
  [[ "$(cat "$out/perf_takehome.py" 2>/dev/null)" == "faster kernel" ]] || fail "output/ lacks the edited perf_takehome.py"
  [[ "$(cat "$out/notes.md" 2>/dev/null)" == "my notes" ]] || fail "output/ lacks the agent's new file"
  local listing
  listing=$(cd "$out" 2>/dev/null && find . -mindepth 1 | sort | tr '\n' ' ')
  [[ "$listing" == "./notes.md ./perf_takehome.py " ]] || fail "perf output/ held: '$listing'"
}

test_agent_without_result_event_is_recorded_as_error() {
  stub_claude_body 'echo "{\"type\":\"system\",\"subtype\":\"init\",\"model\":\"claude-stub-1\"}"'
  "$REPO/run.sh" --one takehome stub-task sonnet 1 >/dev/null 2>&1
  local result="$RUNS_DIR/$RUN_DIR_NAME/result.json"
  [[ -f "$result" ]] || { fail "no result.json"; return; }
  assert_field "$result" is_error 'true'
  assert_field "$result" cost_usd 'null'
  assert_field "$result" turns 'null'
}

test_batch_mode_runs_every_requested_rep() {
  stub_claude
  FORMATS=takehome TASKS=stub-task AGENTS=sonnet REPS=2 JOBS=2 "$REPO/run.sh" >/dev/null 2>&1 || fail "batch run exited non-zero"
  [[ -f "$RUNS_DIR/takehome__stub-task__sonnet__r1/result.json" ]] || fail "r1 missing"
  [[ -f "$RUNS_DIR/takehome__stub-task__sonnet__r2/result.json" ]] || fail "r2 missing"
  [[ ! -e "$RUNS_DIR/takehome__stub-task__sonnet__r3" ]] || fail "ran more reps than requested"
}

ORIGINAL_PATH="$PATH"
ORIGINAL_HOME="$HOME"
for t in $(declare -F | awk '{print $3}' | grep '^test_'); do
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
