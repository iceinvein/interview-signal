#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Building CLI application..."
# No dependencies and no compile step: just verify the sources parse.
node --check src/*.js
echo "Build completed"
