#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Building CLI application..."
# No runtime dependencies and no transpile step; just syntax-check the sources.
node --check src/orderController.js
node --check src/cli.js
chmod +x src/cli.js
echo "Build completed"
