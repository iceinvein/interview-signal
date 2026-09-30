#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Building CLI application..."
# Plain Node.js with no dependencies: nothing to compile, so just verify it loads.
node --check src/index.js src/cli.js src/orderController.js
echo "Build completed"
