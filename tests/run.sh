#!/bin/sh
# Every test in the project. No dependencies, no build step.
#   ./tests/run.sh
set -e
cd "$(dirname "$0")/.."

# Parse every script the page loads. A duplicate declaration or a stray
# bracket takes the whole app down at load time, and no unit test that
# imports one module in isolation will notice.
echo "── syntax ──────────────────────────────────"
for f in js/*.js sw.js; do node --check "$f" || exit 1; done
python3 -c "import ast,sys; ast.parse(open('server.py',encoding='utf-8').read())"
echo "all scripts parse"

echo
echo "── fit engine ──────────────────────────────"
node tests/test_fit_engine.js

echo
echo "── second-hand listings ────────────────────"
node tests/test_resale.js

echo
echo "── size ledger ─────────────────────────────"
node tests/test_ledger.js

echo
echo "── measurement staleness ───────────────────"
node tests/test_staleness.js

echo
echo "── daily outfit log ────────────────────────"
node tests/test_wearlog.js

echo
echo "── server ──────────────────────────────────"
python3 tests/test_server.py

echo
echo "All tests passed."
