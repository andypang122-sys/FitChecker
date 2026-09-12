#!/bin/sh
# Every test in the project. No dependencies, no build step.
#   ./tests/run.sh
set -e
cd "$(dirname "$0")/.."

echo "── fit engine ──────────────────────────────"
node tests/test_fit_engine.js

echo
echo "── server ──────────────────────────────────"
python3 tests/test_server.py

echo
echo "All tests passed."
