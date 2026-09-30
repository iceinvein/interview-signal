#!/bin/bash
set -e
cd "$(dirname "$0")/.."
echo "Running CLI application..."
node src/cli.js --demo scripts/result.txt > /dev/null
echo "CLI application execution completed"
