#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Building CLI application..."
# No runtime dependencies and no transpilation: plain ES modules on Node >= 22.
# The build step installs (dev) dependencies if any and syntax-checks the sources.
npm install --no-audit --no-fund
for file in src/*.js; do
  node --check "$file"
done
echo "Build completed"
