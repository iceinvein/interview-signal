#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Runs the scripted real-time simulation (~30s). For the interactive CLI use: npm start
echo "Running CLI application..."
node src/index.js --simulate | tee scripts/result.txt
echo "CLI application execution completed"
