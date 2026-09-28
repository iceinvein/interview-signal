#!/bin/bash
set -euo pipefail

echo "Running CLI application..."
node dist/demo.js > scripts/result.txt
echo "CLI application execution completed"
