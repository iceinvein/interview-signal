#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Building CLI application..."
# No runtime dependencies and no compile step; verify the sources load.
node --check src/cli.js
node --check src/orderController.js
node --check src/format.js
chmod +x src/cli.js
echo "Build completed"
