#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

# Runs the scripted simulation (~45s, real 10s processing time) and writes scripts/result.txt.
# For the interactive CLI use: npm start
echo "Running CLI application..."
node src/simulate.js "$SCRIPT_DIR/result.txt"
echo "CLI application execution completed"
