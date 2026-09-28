#!/usr/bin/env bash
# Both variants review the same module, so they share one answer key and scorer.
set -euo pipefail
hidden="$(cd "$(dirname "$0")" && pwd)"
exec "$hidden/../../billing-with-readme/hidden/run.sh" "$1"
