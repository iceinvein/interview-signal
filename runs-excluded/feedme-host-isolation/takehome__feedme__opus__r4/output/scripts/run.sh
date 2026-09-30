#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Running CLI application..."
# Feeds the scripted demo (scripts/demo.txt) into the same command loop used
# interactively. Run `npm start` for the interactive session.
node src/cli.js < scripts/demo.txt > scripts/result.txt
echo "CLI application execution completed"
