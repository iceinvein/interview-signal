#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
exec python3 "$here/../../run_suite.py" "$here/suite.test.ts" "$1"
