#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Running CLI application..."
# Scripted demo (about 45s) writing to scripts/result.txt.
# For the interactive prompt run: node src/index.js
node src/index.js --demo --output scripts/result.txt
echo "CLI application execution completed"
