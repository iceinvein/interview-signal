#!/usr/bin/env bash
# Scores <solution_dir> against a freshly fetched pristine upstream, so edits
# the solution made to tests/ or the simulator cannot change the score.
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

TZ=UTC python3 "$task/hidden/score.py" "$pristine/upstream" "$solution"
