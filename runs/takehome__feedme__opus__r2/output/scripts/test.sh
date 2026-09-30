#!/bin/bash
# Unit Test Script: runs the Node.js built-in test runner (no dependencies).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Running unit tests..."
npm test
echo "Unit tests completed"
