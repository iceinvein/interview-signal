#!/bin/bash
set -e
cd "$(dirname "$0")/.."
echo "Building CLI application..."
# No dependencies or compile step; verify the sources load.
node --check src/orderController.js
node --check src/cli.js
echo "Build completed"
