#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Plain JavaScript with no dependencies: "building" means installing (none)
# and checking every source file parses.
echo "Building CLI application..."
npm install --no-audit --no-fund
for file in src/*.js; do node --check "$file"; done
echo "Build completed"
