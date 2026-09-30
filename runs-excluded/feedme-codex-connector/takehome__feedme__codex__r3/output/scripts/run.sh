#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node src/cli.js < scripts/demo.txt > scripts/result.txt
