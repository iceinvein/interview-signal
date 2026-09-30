#!/bin/bash
set -e
cd "$(dirname "$0")/.."
echo "Running CLI application..."
node src/cli.js --demo > scripts/result.txt
echo "CLI application execution completed"
