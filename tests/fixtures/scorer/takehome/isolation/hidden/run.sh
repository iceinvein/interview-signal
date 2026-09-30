#!/usr/bin/env bash
# Reports what a checker can see and do from where score.py runs it, as one
# result per property.
set -uo pipefail
solution=$1
result() { if eval "$2" > /dev/null 2>&1; then printf '{"id": "%s", "passed": true}' "$1"; else printf '{"id": "%s", "passed": false}' "$1"; fi; }
echo "{\"results\": [$(result as-candidate '[ "$(id -un)" = candidate ]'),
 $(result no-host-users '[ ! -e /Users ]'),
 $(result solution-read-only '! touch "$solution/new-file"'),
 $(result task-read-only '! touch "$(dirname "$0")/new-file"'),
 $(result host-postgres-blocked '! timeout 5 bash -c "exec 3<>/dev/tcp/192.168.5.2/5432"'),
 $(result registry-reachable 'timeout 10 bash -c "exec 3<>/dev/tcp/registry.npmjs.org/443"'),
 $(result solution-file-present '[ -f "$solution/answer.txt" ]'),
 $(result planted-link-absent '[ ! -e "$solution/leak.txt" ] && [ ! -L "$solution/leak.txt" ]')], \"metrics\": {}}"
