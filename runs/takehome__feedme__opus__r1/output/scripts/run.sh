#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Running CLI application..."
# Runs the scripted demo scenario (real 10s processing time, ~26s total).
# For the interactive CLI use: npm start
node src/cli.js --demo > scripts/result.txt
echo "CLI application execution completed"
