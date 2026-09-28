#!/usr/bin/env bash
# Scores <solution_dir>/perf_takehome.py against a freshly fetched pristine
# upstream, so edits the solution made to tests/ or the simulator do not count.
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: run.sh <solution_dir>" >&2
  exit 2
fi
task=$(cd "$(dirname "$0")/.." && pwd)
solution=$(cd "$1" && pwd)

pristine=$(mktemp -d)
trap 'rm -rf "$pristine"' EXIT
"$task/fetch.sh" "$pristine/upstream" >&2

if [ -f "$solution/perf_takehome.py" ]; then
  cp "$solution/perf_takehome.py" "$pristine/upstream/perf_takehome.py"
elif [ -f "$solution/UPSTREAM_BASELINE" ]; then
  # reference/ stands for the unmodified upstream, which cannot be committed.
  :
else
  echo "run.sh: $solution has no perf_takehome.py" >&2
  echo '{"results": [{"id": "correct", "passed": false}], "metrics": {}}'
  exit 0
fi

TZ=UTC python3 "$task/hidden/score.py" "$pristine/upstream"
