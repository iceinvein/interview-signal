#!/bin/bash
set -euo pipefail

# Run Script: feeds a scripted demo session into the CLI and writes the output to scripts/result.txt.
# For an interactive session run: npm start
cd "$(dirname "$0")"

echo "Running CLI application..."
node ../src/index.js < demo-commands.txt > result.txt
cat result.txt
echo "CLI application execution completed"
