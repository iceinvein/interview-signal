#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Plain JavaScript with zero dependencies: nothing to compile, so the build
# installs dependencies (none today) and syntax-checks every source file.
echo "Building CLI application..."
npm install --no-audit --no-fund
for file in src/*.js; do
  node --check "$file"
done
echo "Build completed"
