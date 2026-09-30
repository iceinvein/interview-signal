#!/bin/bash
# Build Script: plain Node.js with zero dependencies, so "build" is install + syntax check.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Building CLI application..."
npm install --no-audit --no-fund
for file in src/*.js; do node --check "$file"; done
echo "Build completed"
