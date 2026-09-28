#!/usr/bin/env bash
# Scores <solution_dir>/FINDINGS.md against the planted-bug answer key.
set -euo pipefail
hidden="$(cd "$(dirname "$0")" && pwd)"
python3 "$hidden/score_findings.py" "$1" "$hidden/answer_key.json"
