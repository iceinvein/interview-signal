#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Runs the scripted (non-interactive) scenario in real time (~35s) and writes scripts/result.txt.
# For the interactive CLI use: npm start
echo "Running CLI application..."
node src/simulate.js scripts/result.txt
echo "CLI application execution completed"
