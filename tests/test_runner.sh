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
  ACCESS_TOKEN="fake-access-$RANDOM$RANDOM"
  REFRESH_TOKEN="fake-refresh-$RANDOM$RANDOM"
  MCP_TOKEN="fake-mcp-$RANDOM$RANDOM"
  stub_keychain $(( ($(date +%s) + 36000) * 1000 ))
  stub_gh 'You are not logged into any GitHub hosts. To log in, run: gh auth login'
}

# The macOS keychain as `security` shows it: Claude's login item holds the
# operator's OAuth tokens and, beside them, tokens for MCP servers.
stub_keychain() { # stub_keychain <expiresAt in ms>
  cat > "$SANDBOX/bin/security" <<EOF
#!/usr/bin/env bash
[[ "\$*" == "find-generic-password -s Claude Code-credentials -a $USER -w" ]] || { echo "security: item not found" >&2; exit 44; }
echo '{"claudeAiOauth":{"accessToken":"$ACCESS_TOKEN","refreshToken":"$REFRESH_TOKEN","expiresAt":$1,"refreshTokenExpiresAt":$1,"scopes":["user:inference","user:profile"],"subscriptionType":"max","rateLimitTier":"tier"},"mcpOAuth":{"slack|1":{"accessToken":"$MCP_TOKEN"}}}'
EOF
  chmod +x "$SANDBOX/bin/security"
}

stub_gh() { # stub_gh <what gh auth status prints>
  printf '#!/usr/bin/env bash\necho %q >&2\nexit 1\n' "$1" > "$SANDBOX/bin/gh"
  chmod +x "$SANDBOX/bin/gh"
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

test_codex_config_pins_model_effort_and_network_and_disables_web_search() {
  stub_codex
  run_one takehome stub-task codex 1
  local expected
  expected=$(printf 'model = "gpt-6-sol"\nmodel_reasoning_effort = "high"\nweb_search = "disabled"\n\n[sandbox_workspace_write]\nnetwork_access = true')
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

test_claude_home_holds_only_gitconfig_and_claude_credentials() {
  stub_claude_body '(cd "$HOME" && ls -A) > home.txt; (cd "$HOME/.claude" && ls -A) > claude-dir.txt'
  run_one takehome stub-task sonnet 1
  local out="$RUNS_DIR/$RUN/output"
  [[ "$(tr '\n' ' ' < "$out/home.txt" 2>/dev/null)" == ".claude .gitconfig " ]] || fail "HOME held: '$(tr '\n' ' ' < "$out/home.txt" 2>/dev/null)'"
  [[ "$(tr '\n' ' ' < "$out/claude-dir.txt" 2>/dev/null)" == ".credentials.json " ]] || fail "HOME/.claude held: '$(tr '\n' ' ' < "$out/claude-dir.txt" 2>/dev/null)'"
}

test_codex_home_dir_holds_only_gitconfig() {
  cat > "$SANDBOX/bin/codex" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == "--version" ]]; then echo "codex-cli 0.0.1"; exit 0; fi
(cd "$HOME" && ls -A) > home.txt
echo '{"type":"turn.completed","usage":{}}'
EOF
  chmod +x "$SANDBOX/bin/codex"
  run_one takehome stub-task codex 1
  [[ "$(tr '\n' ' ' < "$RUNS_DIR/$CODEX_RUN/output/home.txt" 2>/dev/null)" == ".gitconfig " ]] || fail "HOME held: '$(tr '\n' ' ' < "$RUNS_DIR/$CODEX_RUN/output/home.txt" 2>/dev/null)'"
}

test_agent_git_sees_only_the_candidate_identity_and_no_signing() {
  # Also run outside any repo, so only system and global config could apply;
  # the system file is where a credential helper would come from.
  stub_claude_body 'git config --list > git-config.txt 2>&1'
  run_one takehome stub-task sonnet 1
  local expected
  expected=$(printf 'user.name=Candidate\nuser.email=candidate@example.invalid\ncommit.gpgsign=false')
  [[ "$(cat "$RUNS_DIR/$RUN/output/git-config.txt" 2>/dev/null)" == "$expected" ]] || fail "git config was: '$(cat "$RUNS_DIR/$RUN/output/git-config.txt" 2>/dev/null)'"
}

test_agent_git_skips_the_system_gitconfig() {
  stub_claude_body 'echo "$GIT_CONFIG_NOSYSTEM" > nosystem.txt'
  run_one takehome stub-task sonnet 1
  [[ "$(cat "$RUNS_DIR/$RUN/output/nosystem.txt" 2>/dev/null)" == "1" ]] || fail "GIT_CONFIG_NOSYSTEM was '$(cat "$RUNS_DIR/$RUN/output/nosystem.txt" 2>/dev/null)'"
}

test_claude_credentials_hold_the_access_token_but_no_refresh_or_mcp_token() {
  stub_claude_body 'cp "$HOME/.claude/.credentials.json" creds.json'
  run_one takehome stub-task sonnet 1
  local creds="$RUNS_DIR/$RUN/output/creds.json"
  [[ -f "$creds" ]] || { fail "no credentials reached the agent"; return; }
  grep -qF "$ACCESS_TOKEN" "$creds" || fail "access token missing"
  ! grep -qF "$REFRESH_TOKEN" "$creds" || fail "refresh token reached the agent"
  ! grep -qF "$MCP_TOKEN" "$creds" || fail "MCP token reached the agent"
}

test_claude_token_expiring_within_the_wall_clock_cap_stops_the_run_unstarted() {
  stub_keychain $(( ($(date +%s) + 600) * 1000 ))
  stub_claude
  local err
  err=$("$REPO/run.sh" --one takehome stub-task sonnet 1 2>&1 >/dev/null) && fail "run.sh started a run its token cannot last"
  [[ "$err" == *"expires"* ]] || fail "stderr did not say why: $err"
  [[ ! -e "$RUNS_DIR/$RUN" ]] || fail "run directory created for a run that never started"
}

test_claude_credential_copy_is_removed_after_the_run() {
  stub_claude
  run_one takehome stub-task sonnet 1
  local left
  left=$(grep -rlF "$ACCESS_TOKEN" "$TMPDIR" 2>/dev/null | grep -v "^$SANDBOX/bin/" || true)
  [[ -z "$left" ]] || fail "credential copy left behind: $left"
}

test_agent_tmpdir_starts_empty_beside_its_home_and_workspace() {
  stub_claude_body '(cd "$TMPDIR" && ls -A) > tmp-listing.txt; (cd "$TMPDIR/.." && pwd -P) > tmp-parent.txt; (cd "$HOME/.." && pwd -P) > home-parent.txt; (cd .. && pwd -P) > work-parent.txt'
  local operator_tmp
  operator_tmp=$(cd "$TMPDIR" && pwd -P)
  run_one takehome stub-task sonnet 1
  local out="$RUNS_DIR/$RUN/output" root
  [[ -f "$out/tmp-listing.txt" && ! -s "$out/tmp-listing.txt" ]] || fail "TMPDIR held: '$(cat "$out/tmp-listing.txt" 2>/dev/null)'"
  root=$(cat "$out/tmp-parent.txt" 2>/dev/null)
  [[ -n "$root" && "$root" != "$operator_tmp" ]] || fail "TMPDIR is the operator's"
  [[ "$(cat "$out/home-parent.txt" 2>/dev/null)" == "$root" ]] || fail "HOME is not in the run's private root"
  [[ "$(cat "$out/work-parent.txt" 2>/dev/null)" == "$root" ]] || fail "workspace is not in the run's private root"
  [[ ! -e "$root" ]] || fail "private root left behind: $root"
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

# A Claude stub for the probe: runs the <command> the prompt names through
# its Bash tool (after $3, a shell snippet standing in for whatever else is
# in the session's HOME), then quotes the CLAUDE.md in its working directory
# (as a session that loaded it would) and says whatever $1 adds. $2 is the
# init event's mcp_servers and $4 its tools.
probe_claude() {
  local mcp=${2:-[]} pre=${3:-} tools=${4:-'["Task","Bash","Edit","Glob","Grep","Read","Write"]'}
  cat > "$SANDBOX/bin/claude" <<EOF
#!/usr/bin/env bash
command=\$(python3 -c 'import re,sys; m = re.search(r"<command>\s*(.*?)\s*</command>", sys.argv[1], re.S); print(m.group(1) if m else "")' "\$2")
$pre
output=\$(bash -c "\$command" 2>&1)
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

# The Codex counterpart: runs the <command> as a command_execution item and
# quotes its AGENTS.md. $1 is a shell snippet run first; $2 is extra event
# lines printed before the turn completes.
probe_codex() {
  local pre=${1:-} extra=${2:-}
  cat > "$SANDBOX/bin/codex" <<EOF
#!/usr/bin/env bash
prompt=\${@: -1}
command=\$(python3 -c 'import re,sys; m = re.search(r"<command>\s*(.*?)\s*</command>", sys.argv[1], re.S); print(m.group(1) if m else "")' "\$prompt")
$pre
output=\$(bash -c "\$command" 2>&1)
python3 - "\$command" "\$output" "\$(cat AGENTS.md)" <<'PY2'
import json, sys
command, output, agents_md = sys.argv[1:4]
print(json.dumps({"type": "item.completed", "item": {"type": "command_execution", "command": command, "aggregated_output": output, "exit_code": 0}}))
print(json.dumps({"type": "item.completed", "item": {"type": "agent_message", "text": agents_md + "\n" + output}}))
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
  probe_codex '' "echo '{\"type\":\"item.completed\",\"item\":{\"id\":\"ws\",\"type\":\"web_search\",\"query\":\"q\"}}'"
  local out
  out=$(AGENTS=codex probe) && fail "probe passed a session that searched the web"
  [[ "$out" == *"web_search"* ]] || fail "probe said: $out"
}

test_probe_fails_an_agent_that_gh_reports_logged_in() {
  stub_gh $'github.com\n  Logged in to github.com account someone (keyring)'
  probe_claude ''
  local out
  out=$(probe) && fail "probe passed a session with a gh login"
  [[ "$out" == *"gh"* ]] || fail "probe said: $out"
}

test_probe_fails_an_agent_whose_global_git_config_has_other_keys() {
  probe_claude '' '[]' 'git config --global credential.helper osxkeychain'
  local out
  out=$(probe) && fail "probe passed a session with extra git config"; echo "$out" >&2
  [[ "$out" == *"git config"* ]] || fail "probe said: $out"
}

test_probe_fails_an_agent_that_has_an_ssh_dir() {
  probe_claude '' '[]' 'mkdir -p "$HOME/.ssh" && touch "$HOME/.ssh/id_ed25519"'
  local out
  out=$(probe) && fail "probe passed a session with ~/.ssh"
  [[ "$out" == *".ssh"* ]] || fail "probe said: $out"
}

test_probe_fails_an_agent_that_reaches_an_ssh_agent() {
  printf '#!/usr/bin/env bash\necho "256 SHA256:abc operator@laptop (ED25519)"\n' > "$SANDBOX/bin/ssh-add"
  chmod +x "$SANDBOX/bin/ssh-add"
  probe_claude ''
  local out
  out=$(probe) && fail "probe passed a session that reached an ssh agent"
  [[ "$out" == *"ssh-add"* ]] || fail "probe said: $out"
}

test_probe_fails_an_agent_that_did_not_run_the_isolation_commands() {
  stub_claude_body 'python3 -c "import json,sys; print(json.dumps({\"type\":\"system\",\"subtype\":\"init\",\"mcp_servers\":[],\"tools\":[\"Bash\"]})); print(json.dumps({\"type\":\"result\",\"is_error\":False,\"result\":open(\"CLAUDE.md\").read()}))"'
  local out
  out=$(probe) && fail "probe passed without evidence from the commands"
  [[ "$out" == *"not run"* ]] || fail "probe said: $out"
}

test_probe_fails_a_claude_session_offered_other_tools() {
  probe_claude '' '[]' '' '["Bash","Read","Monitor"]'
  local out
  out=$(probe) && fail "probe passed a session offered Monitor"
  [[ "$out" == *"Monitor"* ]] || fail "probe said: $out"
}

test_probe_leaves_no_temp_dirs_behind() {
  probe_claude ''
  local before after left
  before=$(ls -A "$TMPDIR" | sort)
  probe >/dev/null
  after=$(ls -A "$TMPDIR" | sort)
  # Only dirs holding what the probe creates count, since other processes share TMPDIR.
  left=$(comm -13 <(echo "$before") <(echo "$after") | while read -r d; do
    [[ -e "$TMPDIR/$d/CLAUDE.md" || -e "$TMPDIR/$d/AGENTS.md" || -e "$TMPDIR/$d/auth.json" || -e "$TMPDIR/$d/home/.gitconfig" ]] && echo "$d"; done)
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
