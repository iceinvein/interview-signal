#!/usr/bin/env bash
# Stands in for a fetched upstream repo: the files run.sh must keep out of
# output/ (upstream code, the protected spec/ and sim.py, .git) next to the
# one file a candidate edits. The names differ from the real perf task's so
# the runner is shown to take them from run_config.json.
set -euo pipefail
dest="$1"
mkdir -p "$dest/spec" "$dest/.git"
echo "upstream kernel" > "$dest/kernel.py"
echo "upstream simulator" > "$dest/sim.py"
echo "upstream readme" > "$dest/Readme.md"
echo "upstream check" > "$dest/spec/check.py"
echo "upstream frozen" > "$dest/spec/frozen.py"
echo "ref: refs/heads/main" > "$dest/.git/HEAD"
