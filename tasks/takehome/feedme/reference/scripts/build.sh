#!/bin/bash
set -euo pipefail

echo "Building CLI application..."
npm ci
npm run build
echo "Build completed"
