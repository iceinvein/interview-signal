#!/usr/bin/env bash
# Usage: hidden/run.sh <solution_dir>
# Scores a copy of the solution; never modifies <solution_dir>.
set -euo pipefail

if [ $# -ne 1 ] || [ ! -d "$1" ]; then
  echo "usage: $0 <solution_dir>" >&2
  exit 2
fi

export TZ=UTC
hidden="$(cd "$(dirname "$0")" && pwd)"
task="$(dirname "$hidden")"
solution="$(cd "$1" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
app="$work/app"
mkdir -p "$app"
(cd "$solution" && tar --exclude=node_modules -cf - .) | (cd "$app" && tar -xf -)

# Dependencies are installed once from the task's own lockfile and shared.
# A solution that changed its dependencies gets a fresh install of its own.
lock="$task/workspace/package-lock.json"
lock_hash="$(shasum -a 256 "$lock" | cut -c1-16)"
cache="${XDG_CACHE_HOME:-$HOME/.cache}/interview-signal/existing-repo-$lock_hash"
if [ ! -d "$cache/node_modules" ]; then
  mkdir -p "$cache"
  cp "$task/workspace/package.json" "$lock" "$cache/"
  (cd "$cache" && npm ci --no-audit --no-fund --silent) >&2
fi
install_ok=1
if python3 "$hidden/score.py" same-deps "$task/workspace/package.json" "$app/package.json"; then
  ln -s "$cache/node_modules" "$app/node_modules"
else
  (cd "$app" && npm install --no-audit --no-fund --silent) >&2 || install_ok=0
fi

typecheck_rc=1
if [ "$install_ok" = 1 ]; then
  (cd "$app" && ./node_modules/.bin/tsc --noEmit) >"$work/typecheck.log" 2>&1 && typecheck_rc=0 || typecheck_rc=$?
  (cd "$app" && ./node_modules/.bin/vitest run --reporter=json --outputFile="$work/suite.json") \
    >"$work/suite.log" 2>&1 || true
  mkdir -p "$app/__acceptance__"
  cp "$hidden/waitlist.acceptance.test.ts" "$app/__acceptance__/waitlist.test.ts"
  cp "$hidden/vitest.acceptance.config.mjs" "$app/__acceptance__/vitest.config.mjs"
  (cd "$app" && ./node_modules/.bin/vitest run --config __acceptance__/vitest.config.mjs \
    --reporter=json --outputFile="$work/acceptance.json") >"$work/acceptance.log" 2>&1 || true
fi

python3 "$hidden/score.py" score \
  --app "$app" \
  --typecheck-rc "$typecheck_rc" \
  --suite "$work/suite.json" \
  --acceptance "$work/acceptance.json" \
  --acceptance-source "$hidden/waitlist.acceptance.test.ts" \
  --originals "$hidden/original-tests.txt"
