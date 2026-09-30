#!/usr/bin/env bash
# Checks the isolation run.sh sets up against the real Docker (Colima) on
# this machine, with plain shell commands in real containers and no model
# sessions. Needs ./run.sh --build-image and ./run.sh --setup-network first.
# One test briefly removes a firewall rule and puts it back with
# --setup-network.
# Run: bash tests/test_isolation_live.sh
set -uo pipefail

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
# shellcheck source=../run.sh
source "$REPO/run.sh"
set +e
failures=0

fail() {
  echo "  FAIL: $*"
  failures=$((failures + 1))
}

on_runs_network() { # on_runs_network <shell command> -> its output
  docker run --rm --network "$RUN_NETWORK" --user candidate "$IMAGE" bash -c "$1" 2>&1
}

test_check_isolation_passes() {
  "$REPO/run.sh" --check-isolation > /dev/null 2>&1 || fail "run.sh --check-isolation failed"
}

test_preflight_catches_a_network_without_the_rules() {
  # The default bridge has no firewall: the VM's sshd answers on its gateway.
  local err gateway
  gateway=$(docker network inspect --format '{{(index .IPAM.Config 0).Gateway}}' bridge)
  err=$(preflight bridge 192.168.5.2 192.168.5.1 "$gateway" 2>&1) && fail "preflight passed the default bridge"
  [[ "$err" == *"$gateway:22"* ]] || fail "preflight did not name $gateway:22: $err"
}

test_host_postgres_is_unreachable_from_the_runs_network() {
  local out
  out=$(on_runs_network 'timeout 5 bash -c "exec 3<>/dev/tcp/192.168.5.2/5432" && echo reachable || echo blocked')
  [[ "$out" == "blocked" ]] || fail "192.168.5.2:5432 from the runs network: $out"
}

test_model_apis_and_registries_answer_https_from_the_runs_network() {
  local url code
  for url in https://registry.npmjs.org/ https://pypi.org/simple/ https://api.anthropic.com/ https://api.openai.com/ https://chatgpt.com/ https://github.com/; do
    code=$(on_runs_network "curl -s -o /dev/null -m 15 -w '%{http_code}' $url")
    [[ "$code" =~ ^[1-5][0-9][0-9]$ && "$code" != 000 ]] || fail "$url answered '$code'"
  done
}

test_containers_on_the_runs_network_cannot_reach_each_other() {
  local name="interview-signal-icc-$RANDOM" address out
  docker run -d --rm --name "$name" --network "$RUN_NETWORK" --user candidate "$IMAGE" python3 -m http.server 8000 > /dev/null
  sleep 1
  address=$(docker inspect --format "{{(index .NetworkSettings.Networks \"$RUN_NETWORK\").IPAddress}}" "$name")
  out=$(on_runs_network "timeout 5 bash -c 'exec 3<>/dev/tcp/$address/8000' && echo reachable || echo blocked")
  [[ "$out" == "blocked" ]] || fail "one container reached another's port 8000: $out"
  # Control: the server itself answers, so blocked means the network, not a dead server.
  docker exec "$name" bash -c "timeout 5 bash -c 'exec 3<>/dev/tcp/127.0.0.1/8000'" || fail "the server never listened"
  docker kill "$name" > /dev/null
}

test_missing_firewall_rule_fails_the_check_until_setup_restores_it() {
  colima ssh -- sudo iptables -D DOCKER-USER -i "$RUN_BRIDGE" -j ISIG-FORWARD
  "$REPO/run.sh" --check-isolation > /dev/null 2>&1 && fail "check passed without the DOCKER-USER rule"
  "$REPO/run.sh" --setup-network > /dev/null || fail "--setup-network failed"
  "$REPO/run.sh" --check-isolation > /dev/null 2>&1 || fail "check failed after --setup-network"
}

test_agent_container_sees_only_its_work_dir_as_candidate() {
  local root out
  mkdir -p "$SCRATCH_DIR"
  root=$(mktemp -d "$SCRATCH_DIR/run.XXXXXX")
  mkdir "$root/work"
  echo mine > "$root/work/given.txt"
  local -a docker_line
  container_command docker_line sonnet "$root" bash -c \
    'id -un; cat given.txt; ls /Users 2>&1 | head -1; ls -a ~/.ssh 2>&1 | head -1; awk "\$2 ~ /^\/(work|codex|Users|home)/ {print \$2}" /proc/mounts'
  out=$("${docker_line[@]}" 2>&1)
  rm -rf "$root"
  local expected="candidate
mine
ls: cannot access '/Users': No such file or directory
ls: cannot access '/home/candidate/.ssh': No such file or directory
/work"
  [[ "$out" == "$expected" ]] || fail "container said: $out"
}

for t in $(declare -F | awk '{print $3}' | grep '^test_'); do
  [[ -z "${1:-}" || "$t" == *"$1"* ]] || continue
  echo "$t"
  before=$failures
  "$t"
  (( failures == before )) && echo "  ok"
done

if (( failures > 0 )); then
  echo "$failures assertion(s) failed"
  exit 1
fi
echo "all passed"
