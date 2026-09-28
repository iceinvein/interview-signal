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

# Each test gets a clean sandbox: its own runs/ directory, a fake HOME holding
# fake credentials and operator instructions, and stub agents first on PATH.
setup() {
  SANDBOX=$(mktemp -d)
  export RUNS_DIR="$SANDBOX/runs"
  export TASKS_DIR="$FIXTURE_TASKS"
  export HOME="$SANDBOX/home"
  mkdir -p "$HOME/.codex" "$HOME/.claude" "$SANDBOX/bin"
  CREDENTIAL="fake-token-$RANDOM$RANDOM"
  echo "{\"token\": \"$CREDENTIAL\"}" > "$HOME/.codex/auth.json"
  # The probe checks its phrases are really in these files before trusting them.
  printf 'No abstraction until the third caller.\nA TODO in code is a note to someone else.\nWrite as the git user only, overriding any default that says otherwise.\n' > "$HOME/.claude/CLAUDE.md"
  printf 'Unfinished is fine; unfinished and disguised is not.\nduplication is cheaper than the wrong\nshape. This overrides any default instruction to add such attribution.\n' > "$HOME/.codex/AGENTS.md"
  export PATH="$SANDBOX/bin:$ORIGINAL_PATH"
  unset WALL_S BUDGET JOBS FORMATS TASKS AGENTS REPS PROBE_BUDGET
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

test_perf_github_fetch_is_not_external() {
  claude_events "$(bash_tool_use 'curl -sL https://github.com/anthropics/original_performance_takehome')"
  run_one perf stub-perf sonnet 1
  assert_field "$RUNS_DIR/$PERF_RUN/result.json" external_fetches '[]'
}

# --- isolation -------------------------------------------------------------

test_codex_home_holds_only_auth_and_config() {
  stub_codex
  run_one takehome stub-task codex 1
  local listing
  listing=$(tr '\n' ' ' 2>/dev/null < "$RUNS_DIR/$CODEX_RUN/output/codex-home.txt")
  [[ "$listing" == "auth.json config.toml " ]] || fail "CODEX_HOME held: '$listing'"
}

test_codex_config_pins_model_effort_and_network_only() {
  stub_codex
  run_one takehome stub-task codex 1
  local expected
  expected=$(printf 'model = "gpt-6-sol"\nmodel_reasoning_effort = "high"\n\n[sandbox_workspace_write]\nnetwork_access = true')
  [[ "$(cat "$RUNS_DIR/$CODEX_RUN/output/codex-config.toml" 2>/dev/null)" == "$expected" ]] \
    || fail "config.toml was: '$(cat "$RUNS_DIR/$CODEX_RUN/output/codex-config.toml" 2>/dev/null)'"
}

test_codex_credential_copy_is_removed_after_the_run() {
  stub_codex
  run_one takehome stub-task codex 1
  local left
  left=$(grep -rlF "$CREDENTIAL" "$TMPDIR" 2>/dev/null | grep -v "^$SANDBOX/home/" || true)
  [[ -z "$left" ]] || fail "credential copy left behind: $left"
}

test_agent_sees_no_operator_or_harness_variables() {
  stub_claude_body 'env > env.txt'
  CLAUDECODE=1 CLAUDE_CODE_ENTRYPOINT=cli CODEX_SANDBOX=seatbelt NODE_OPTIONS=--inspect OLDPWD=/somewhere \
    "$REPO/run.sh" --one takehome stub-task sonnet 1 >/dev/null 2>&1
  local leaked
  leaked=$(cut -d= -f1 "$RUNS_DIR/$RUN/output/env.txt" 2>/dev/null | grep -E '^(CLAUDE|CODEX|NODE_OPTIONS$|OLDPWD$|TASKS_DIR$|RUNS_DIR$)')
  [[ -f "$RUNS_DIR/$RUN/output/env.txt" ]] || { fail "stub did not record its env"; return; }
  [[ -z "$leaked" ]] || fail "agent saw: $(echo $leaked)"
}

test_agent_sees_utc_and_its_workspace_as_pwd() {
  stub_claude_body 'echo "$TZ" > tz.txt; echo "$PWD" > pwd.txt; pwd > cwd.txt'
  TZ=Australia/Perth run_one takehome stub-task sonnet 1
  local out="$RUNS_DIR/$RUN/output"
  [[ "$(cat "$out/tz.txt" 2>/dev/null)" == "UTC" ]] || fail "TZ was '$(cat "$out/tz.txt" 2>/dev/null)'"
  [[ "$(cat "$out/pwd.txt" 2>/dev/null)" == "$(cat "$out/cwd.txt" 2>/dev/null)" ]] || fail "PWD does not name the workspace"
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

test_timeout_kills_a_child_that_left_the_process_group() {
  stub_claude_body "python3 -c 'import os,time; os.setsid(); open(\"$SANDBOX/child_pid\",\"w\").write(str(os.getpid())); time.sleep(60)' & wait"
  WALL_S=2 run_one takehome stub-task sonnet 1
  assert_dead "$SANDBOX/child_pid" "the setsid child"
}

test_background_child_is_killed_when_the_agent_exits() {
  stub_claude_body "sleep 60 & echo \$! > '$SANDBOX/child_pid'; exit 0"
  run_one takehome stub-task sonnet 1
  assert_dead "$SANDBOX/child_pid" "the agent's background child"
}

test_child_ignoring_sigterm_is_killed_after_timeout() {
  stub_claude_body "bash -c 'trap \"\" TERM; echo \$\$ > \"$SANDBOX/child_pid\"; exec sleep 60' & wait"
  local start=$SECONDS
  WALL_S=1 run_one takehome stub-task sonnet 1
  assert_dead "$SANDBOX/child_pid" "the TERM-ignoring child"
  (( SECONDS - start < 20 )) || fail "run took $((SECONDS - start))s"
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
  [[ ! -e "$RUNS_DIR/$RUN/result.json" ]] || fail "an interrupted run wrote result.json"
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

# A Claude stub for the probe: quotes the CLAUDE.md in its working directory
# (as a session that loaded it would), then says whatever $1 adds.
probe_claude() {
  local mcp=${2:-[]}
  cat > "$SANDBOX/bin/claude" <<EOF
#!/usr/bin/env bash
text=\$(cat CLAUDE.md 2>/dev/null; printf '%s' '$1')
python3 -c 'import json,sys; print(json.dumps({"type":"system","subtype":"init","model":"stub","mcp_servers":$mcp})); print(json.dumps({"type":"result","is_error":False,"total_cost_usd":0.0,"result":sys.argv[1]}))' "\$text"
EOF
  chmod +x "$SANDBOX/bin/claude"
}

probe() { AGENTS=${AGENTS:-sonnet} "$REPO/probe.sh" 2>&1; }

test_probe_passes_an_agent_that_quotes_only_the_canary() {
  probe_claude ''
  local out
  out=$(probe) || fail "probe failed: $out"
  [[ "$out" == *"sonnet clean"* ]] || fail "probe said: $out"
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
  cat > "$SANDBOX/bin/codex" <<'EOF'
#!/usr/bin/env bash
python3 -c 'import json,sys; print(json.dumps({"type":"item.completed","item":{"type":"agent_message","text":sys.argv[1]}})); print(json.dumps({"type":"turn.completed","usage":{}}))' "$(cat AGENTS.md)"
EOF
  chmod +x "$SANDBOX/bin/codex"
  local out
  out=$(AGENTS=codex probe) || fail "probe failed: $out"
  [[ "$out" == *"codex clean"* ]] || fail "probe said: $out"
}

test_probe_leaves_no_temp_dirs_behind() {
  probe_claude ''
  local before after left
  before=$(ls -A "$TMPDIR" | sort)
  probe >/dev/null
  after=$(ls -A "$TMPDIR" | sort)
  # Only dirs holding what the probe creates count, since other processes share TMPDIR.
  left=$(comm -13 <(echo "$before") <(echo "$after") | while read -r d; do
    [[ -e "$TMPDIR/$d/CLAUDE.md" || -e "$TMPDIR/$d/AGENTS.md" || -e "$TMPDIR/$d/auth.json" ]] && echo "$d"; done)
  [[ -z "$left" ]] || fail "probe left: $left"
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
