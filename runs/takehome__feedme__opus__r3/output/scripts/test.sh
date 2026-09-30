#!/bin/bash
set -euo pipefail

# Unit Test Script
cd "$(dirname "$0")/.."

echo "Running unit tests..."
npm test
echo "Unit tests completed"
