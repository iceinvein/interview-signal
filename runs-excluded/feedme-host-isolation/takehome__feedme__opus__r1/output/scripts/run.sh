#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

# Runs a scripted scenario (~40s, real 10s processing time) and writes scripts/result.txt.
# For the interactive CLI use: npm start
echo "Running CLI application..."
node ../src/simulate.js result.txt
echo "CLI application execution completed"
