#!/usr/bin/env bash
# Stands in for a fetched upstream repo: the files run.sh must keep out of
# output/ (upstream code, tests, .git) next to the one file a candidate edits.
set -euo pipefail
dest="$1"
mkdir -p "$dest/tests" "$dest/.git"
echo "upstream kernel" > "$dest/perf_takehome.py"
echo "upstream problem" > "$dest/problem.py"
echo "upstream readme" > "$dest/Readme.md"
echo "upstream test" > "$dest/tests/submission_tests.py"
echo "ref: refs/heads/main" > "$dest/.git/HEAD"
