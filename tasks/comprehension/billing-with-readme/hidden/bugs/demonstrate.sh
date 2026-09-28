#!/usr/bin/env bash
# Proves the planted bugs are real: both modules typecheck, the fixed module
# passes every bug test, and the workspace module fails every one of them.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"
[[ -d node_modules ]] || npm ci --no-fund --no-audit >/dev/null

npx tsc -p .
BILLING_MODULE="$here/billing.fixed.ts" npx vitest run --reporter=dot >/dev/null

report="$(mktemp)"
trap 'rm -f "$report"' EXIT
BILLING_MODULE="$here/../../workspace/billing.ts" \
  npx vitest run --reporter=json --outputFile="$report" >/dev/null 2>&1 || true
python3 - "$report" "$here/../answer_key.json" <<'PY'
import json, sys
report = json.load(open(sys.argv[1]))
bug_ids = [bug["id"] for bug in json.load(open(sys.argv[2]))["bugs"]]
status = {}
for suite in report["testResults"]:
    for case in suite["assertionResults"]:
        status[case["title"].split(":")[0]] = case["status"]
wrong = [bug for bug in bug_ids if status.get(bug) != "failed"]
if wrong:
    sys.exit(f"workspace module does not fail the test for: {', '.join(wrong)}")
print(f"ok: {len(bug_ids)} planted bugs, each failing its own test")
PY
