#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Building CLI application..."
# No third-party dependencies and no transpilation step: install (no-op) and syntax-check sources.
npm install --no-audit --no-fund
for f in src/*.js; do node --check "$f"; done
echo "Build completed"
