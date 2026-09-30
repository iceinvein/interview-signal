#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Plain Node.js with no dependencies or transpilation: "building" means
# installing (none) and syntax-checking every source file.
echo "Building CLI application..."
npm install --no-audit --no-fund
for file in src/*.js; do
  node --check "$file"
done
echo "Build completed"
