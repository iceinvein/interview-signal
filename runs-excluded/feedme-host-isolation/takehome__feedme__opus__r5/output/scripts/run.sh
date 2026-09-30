#!/bin/bash
# Run Script: feeds a scripted scenario to the CLI and writes the log to scripts/result.txt.
# For the interactive CLI run: npm start
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Running CLI application..."
node src/cli.js --output scripts/result.txt < scripts/demo-commands.txt
echo "CLI application execution completed"
