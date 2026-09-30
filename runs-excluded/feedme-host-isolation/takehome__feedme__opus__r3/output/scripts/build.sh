#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Plain JavaScript with no dependencies: "building" is a syntax check of every source file.
echo "Building CLI application..."
for file in src/*.js; do
  node --check "$file"
done
echo "Build completed"
