#!/usr/bin/env bash
# Passes when <solution_dir>/answer.txt holds exactly 42.
set -euo pipefail
solution_dir="$1"
if [[ -f "$solution_dir/answer.txt" && "$(cat "$solution_dir/answer.txt")" == "42" ]]; then
  passed=true
else
  passed=false
fi
printf '{"results": [{"id": "answer", "passed": %s}], "metrics": {}}\n' "$passed"
