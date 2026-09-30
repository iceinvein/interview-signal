#!/bin/bash
set -e
cd "$(dirname "$0")/.."

echo "Building CLI application..."
npm install --no-audit --no-fund
npm run build
echo "Build completed"
