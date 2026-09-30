#!/bin/bash
# Unit Test Script
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Running unit tests..."
npm test
echo "Unit tests completed"
