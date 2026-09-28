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
# Parallel runs each build a private copy beside the cache and publish it with
# one atomic rename; a run that loses the race deletes its copy. Only a
# published directory carries the .installed marker.
# A solution that changed its dependencies gets a fresh install of its own.
lock="$task/workspace/package-lock.json"
lock_hash="$(shasum -a 256 "$lock" | cut -c1-16)"
cache_root="${EXISTING_REPO_DEPS_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/interview-signal}"
cache="$cache_root/existing-repo-$lock_hash"
if [ ! -f "$cache/.installed" ]; then
  mkdir -p "$cache_root"
  build="$(mktemp -d "$cache_root/.build-XXXXXX")"
  trap 'rm -rf "$work" "$build"' EXIT
  cp "$task/workspace/package.json" "$lock" "$build/"
  (cd "$build" && npm ci --no-audit --no-fund --silent) >&2
  touch "$build/.installed"
  python3 - "$build" "$cache" <<'PY'
import os, shutil, sys
build, cache = sys.argv[1], sys.argv[2]
try:
    os.rename(build, cache)
except OSError:
    shutil.rmtree(build)
PY
  if [ ! -f "$cache/.installed" ]; then
    echo "dependency cache $cache exists but was never published; remove it and rerun" >&2
    exit 1
  fi
fi

install_ok=1
if python3 "$hidden/score.py" same-deps "$task/workspace/package.json" "$app/package.json"; then
  ln -s "$cache/node_modules" "$app/node_modules"
  for bin in tsc vitest; do
    if [ ! -x "$app/node_modules/.bin/$bin" ]; then
      echo "shared dependency cache $cache has no node_modules/.bin/$bin" >&2
      exit 1
    fi
  done
else
  # A solution whose own dependency set fails to install or drops the tools
  # scores as failing everything; that is the solution's doing, not the checker's.
  (cd "$app" && npm install --no-audit --no-fund --silent) >&2 || install_ok=0
  [ -x "$app/node_modules/.bin/tsc" ] && [ -x "$app/node_modules/.bin/vitest" ] || install_ok=0
fi

typecheck_rc=1
if [ "$install_ok" = 1 ]; then
  (cd "$app" && ./node_modules/.bin/tsc --noEmit) >"$work/typecheck.log" 2>&1 && typecheck_rc=0 || typecheck_rc=$?
  (cd "$app" && ./node_modules/.bin/vitest run --no-cache --reporter=json --outputFile="$work/suite.json") \
    >"$work/suite.log" 2>&1 || true
  mkdir -p "$app/__acceptance__"
  cp "$hidden/waitlist.acceptance.test.ts" "$app/__acceptance__/waitlist.test.ts"
  cp "$hidden/vitest.acceptance.config.mjs" "$app/__acceptance__/vitest.config.mjs"
  (cd "$app" && ./node_modules/.bin/vitest run --no-cache --config __acceptance__/vitest.config.mjs \
    --reporter=json --outputFile="$work/acceptance.json") >"$work/acceptance.log" 2>&1 || true
fi

python3 "$hidden/score.py" score \
  --app "$app" \
  --typecheck-rc "$typecheck_rc" \
  --suite "$work/suite.json" \
  --acceptance "$work/acceptance.json" \
  --acceptance-source "$hidden/waitlist.acceptance.test.ts" \
  --originals "$hidden/original-tests.txt"
