#!/usr/bin/env bash
# Usage: hidden/run.sh <solution_dir>
set -euo pipefail
export TZ=UTC
exec python3 "$(dirname "$0")/check.py" "$1"
