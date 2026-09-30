#!/bin/bash
set -e
cd "$(dirname "$0")/.."

echo "Building CLI application..."
# Plain Node.js, no dependencies or compile step: just verify the sources parse.
node --check src/orderController.js
node --check src/index.js
chmod +x src/index.js
echo "Build completed"
