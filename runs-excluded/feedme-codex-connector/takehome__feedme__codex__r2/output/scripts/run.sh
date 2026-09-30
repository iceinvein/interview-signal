#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "${1:-}" == "--interactive" ]]; then
  exec node src/cli.js --interactive
fi
if [[ $# -ne 0 ]]; then
  echo "Usage: scripts/run.sh [--interactive]" >&2
  exit 1
fi
node src/cli.js --demo > scripts/result.txt
cat scripts/result.txt
