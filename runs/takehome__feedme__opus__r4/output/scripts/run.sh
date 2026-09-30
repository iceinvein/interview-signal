#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Runs the scripted (non-interactive) simulation in real time (~30s).
# For the interactive CLI use: npm start
echo "Running CLI application..."
node src/simulate.js > scripts/result.txt
echo "CLI application execution completed"
