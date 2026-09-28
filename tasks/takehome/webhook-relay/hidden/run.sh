#!/usr/bin/env bash
# Usage: hidden/run.sh <solution_dir>
# Starts the solution with npm start and checks it over HTTP; see check.py.
set -euo pipefail
export TZ=UTC
exec python3 "$(dirname "$0")/check.py" "$1"
