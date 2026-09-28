#!/usr/bin/env bash
# Passes "present" when <solution_dir>/answer.txt exists and "answer" when it
# holds exactly 42, "utc" when it runs under TZ=UTC, and reports the byte count.
set -euo pipefail
file="$1/answer.txt"
present=false answer=false bytes=0
if [[ -f "$file" ]]; then
  present=true
  bytes=$(wc -c < "$file" | tr -d ' ')
  [[ "$(cat "$file")" == "42" ]] && answer=true
fi
utc=false
[[ "${TZ:-}" == UTC ]] && utc=true
echo "checked $file under TZ=${TZ:-unset}" >&2
printf '{"results": [{"id": "answer", "passed": %s}, {"id": "present", "passed": %s}, {"id": "utc", "passed": %s}], "metrics": {"bytes": %s}}\n' \
  "$answer" "$present" "$utc" "$bytes"
