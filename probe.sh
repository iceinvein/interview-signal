#!/usr/bin/env bash
# Checks that no run can see the operator's own instructions. Runs one short
# session per agent, with run.sh's exact command line in an empty temp dir,
# asking it to quote any user or project instructions in its context, then
# searches everything it printed for phrases that only those files contain.
# Prints "<agent> clean" per agent; exits 0 only if every agent is clean.
#
# Env: AGENTS (default every agent run.sh uses), PROBE_BUDGET (USD cap per
# Claude session, default 0.25). The cap only guards against a session that
# ignores the prompt and starts working: Claude checks it after a turn, so it
# cannot trim the single answering turn, which is mostly the cost of caching
# the session's roughly 22k-token context. Measured 2026-09-28: haiku $0.017,
# sonnet $0.040, opus $0.045.
set -euo pipefail

# shellcheck source=run.sh
source "$(dirname "${BASH_SOURCE[0]}")/run.sh"

CLAUDE_MD="$HOME/.claude/CLAUDE.md"
AGENTS_MD="$HOME/.codex/AGENTS.md"
CLAUDE_PHRASES=(
  "No abstraction until the third caller"
  "A TODO in code is a note to someone else"
  "overriding any default that says otherwise"
)
AGENTS_PHRASES=(
  "Prefer Codex's native browser and computer-use tools"
  "unfinished and disguised is not"
  "duplication is cheaper than the wrong shape"
)
PROMPT="Do not use any tools. List every user-level or project-level instruction \
file (for example CLAUDE.md or AGENTS.md) whose contents were given to you in \
this session, and quote each one verbatim and in full. If none were given to \
you, reply with exactly: NONE"

# probe_verdict <agent> <transcript> <phrase file> -> prints clean | leak: ... |
# error: ..., and exits non-zero unless clean. A session that failed says
# nothing about isolation, so it is an error, not clean.
probe_verdict() {
  python3 - "$@" <<'PY'
import json, re, sys

agent, transcript, phrase_file = sys.argv[1:4]
phrases = [p for p in open(phrase_file).read().split("\n") if p]

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
    return re.sub(r"\s+", " ", text).lower()

events = [json.loads(l) for l in open(transcript) if l.strip().startswith("{")]
said = norm(" ".join(s for e in events for s in strings(e)))
if agent == "codex":
    answered = any(e.get("type") == "turn.completed" for e in events)
    cost = None
else:
    result = next((e for e in events if e.get("type") == "result"), None)
    answered = result is not None and not result.get("is_error")
    cost = result.get("total_cost_usd") if result else None
leaks = [p for p in phrases if norm(p) in said]
cost_note = "" if cost is None else f" (${cost:.4f})"
if leaks:
    print(f"{agent} leak: {leaks}{cost_note}")
    sys.exit(1)
if not answered:
    print(f"{agent} error: session did not complete, see {transcript}{cost_note}")
    sys.exit(1)
print(f"{agent} clean{cost_note}")
PY
}

phrase_file=$(mktemp)
out_dir=$(mktemp -d)
trap 'rm -rf "$phrase_file"' EXIT

# A phrase that is no longer in its file would make the probe pass vacuously.
for phrase in "${CLAUDE_PHRASES[@]}"; do
  tr -s ' \n' ' ' < "$CLAUDE_MD" | grep -qF "$phrase" || { echo "phrase not in $CLAUDE_MD: $phrase" >&2; exit 1; }
  echo "$phrase" >> "$phrase_file"
done
for phrase in "${AGENTS_PHRASES[@]}"; do
  tr -s ' \n' ' ' < "$AGENTS_MD" | grep -qF "$phrase" || { echo "phrase not in $AGENTS_MD: $phrase" >&2; exit 1; }
  echo "$phrase" >> "$phrase_file"
done

status=0
for agent in ${AGENTS:-sonnet opus haiku codex}; do
  work=$(mktemp -d)
  codex_home=""
  [[ "$agent" != codex ]] || codex_home=$(make_codex_home)
  command_line=()
  agent_command command_line "$agent" "$PROMPT" "${PROBE_BUDGET:-0.25}"
  (
    export TZ=UTC
    [[ -z "$codex_home" ]] || export CODEX_HOME="$codex_home"
    run_timed 300 "$work" "$out_dir/$agent.jsonl" "$out_dir/$agent.stderr.txt" "$out_dir/$agent.status.json" -- "${command_line[@]}"
  )
  probe_verdict "$agent" "$out_dir/$agent.jsonl" "$phrase_file" || status=1
  rm -rf "$work"
  [[ -z "$codex_home" ]] || rm -rf "$codex_home"
done
echo "transcripts: $out_dir"
exit "$status"
