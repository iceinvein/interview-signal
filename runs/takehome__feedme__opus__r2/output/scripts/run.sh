#!/bin/bash
# Run Script: feeds the scripted scenario into the interactive CLI and writes
# the timestamped log to scripts/result.txt. For a live session run: npm start
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Running CLI application..."
node src/cli.js < scripts/scenario.txt > scripts/result.txt
echo "CLI application execution completed"
