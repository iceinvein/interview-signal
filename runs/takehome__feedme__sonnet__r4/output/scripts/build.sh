#!/bin/bash
set -e
cd "$(dirname "$0")/.."

echo "Building CLI application..."
# No dependencies or compile step; just verify the sources parse.
node --check src/orderController.js
node --check src/cli.js
chmod +x src/cli.js
echo "Build completed"
