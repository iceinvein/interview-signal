#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Plain Node.js with no dependencies: nothing to compile, so validate syntax instead.
echo "Building CLI application..."
for file in src/*.js; do
  node --check "$file"
done
echo "Build completed"
