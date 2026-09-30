#!/bin/bash
# Build Script: plain JavaScript with no dependencies, so "building" means
# installing (nothing) and syntax-checking every source file.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Building CLI application..."
npm install --no-audit --no-fund
for file in src/*.js; do
  node --check "$file"
done
echo "Build completed"
