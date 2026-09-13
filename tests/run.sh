#!/bin/sh
# Every test in the project. No dependencies, no build step.
#   ./tests/run.sh
set -e
cd "$(dirname "$0")/.."

# Windows installs Python as `python`, not `python3`; take whichever exists.
PY=$(command -v python3 || command -v python)

# Parse every script the page loads. A duplicate declaration or a stray
# bracket takes the whole app down at load time, and no unit test that
# imports one module in isolation will notice.
echo "── syntax ──────────────────────────────────"
for f in js/*.js sw.js; do node --check "$f" || exit 1; done
"$PY" -c "import ast,sys; ast.parse(open('server.py',encoding='utf-8').read())"
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
echo "── style profile & catalogue ───────────────"
node tests/test_style_profile.js

echo
echo "── server ──────────────────────────────────"
"$PY" tests/test_server.py

echo
echo "All tests passed."
