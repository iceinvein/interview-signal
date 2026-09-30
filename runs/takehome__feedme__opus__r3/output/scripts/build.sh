#!/bin/bash
set -euo pipefail

# Build Script: plain Node.js (no transpilation, no dependencies) - install and syntax-check sources.
cd "$(dirname "$0")/.."

echo "Building CLI application..."
npm install --no-audit --no-fund
for file in src/*.js; do
  node --check "$file"
done
echo "Build completed"
