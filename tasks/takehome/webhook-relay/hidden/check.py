"""Acceptance checks for the webhook relay take-home, driven over HTTP only.

Usage: python3 check.py <solution_dir>

Copies the solution (without node_modules) to a scratch directory, runs
`npm install` and `npm start` there with PORT and TENANTS_FILE set, and plays
both the webhook sender and every tenant's destination. Prints one JSON
object to stdout. Candidate failures, including a service that never starts,
are reported as failed results; only a broken checker exits non-zero.
"""

import base64
import http.client
import http.server
import json
import os
import pathlib
import shutil
import signal
import socket
import socketserver
import subprocess
import sys
import tempfile
import threading
import time

RESULT_IDS = [
    "forwards-body",
    "acknowledges-before-delivery",
    "unknown-tenant-404",
    "retries-until-success",
    "retry-limit",
    "backoff-timing",
    "stable-event-id",
    "rate-limit",
    "isolation-rate-limit",
    "isolation-delivery",
    "own-tests-pass",
]

# A credential-shaped value sent inside every webhook body. If it shows up in
# the service's output or files, the service stored request bodies.
SECRET = "sk_live_4f9c2e71b0d84a6c9e3f5a7b1d2c8e60"


def secret_needles(secret: bytes) -> list[bytes]:
    """Byte strings that appear wherever the secret is written plainly or in a
    common encoding of a body that contains it: hex, a Node Buffer serialised
    as JSON (`"data":[115,107,...]`), and base64 at each of the three byte
    alignments the secret can have within the body. Base64 characters that
    straddle bytes outside the secret are dropped from each end."""
    needles = [secret, secret.hex().encode(), secret.hex().upper().encode(),
               ",".join(str(b) for b in secret).encode()]
    for offset in range(3):
        encoded = base64.b64encode(b"\0" * offset + secret)
        needles.append(encoded[4 if offset else 0:-4])
    return needles


SECRET_NEEDLES = secret_needles(SECRET.encode())


def contains_secret(data: bytes) -> bool:
    return any(needle in data for needle in SECRET_NEEDLES)

INSTALL_TIMEOUT_S = 300
STARTUP_TIMEOUT_S = 60
OWN_TESTS_TIMEOUT_S = 300

# Each tenant is used by exactly one check so checks cannot disturb each other.
TENANTS = {
    "basic": {"maxAttempts": 3, "initialBackoffMs": 200, "requestsPerSecond": 50},
    "slow": {"maxAttempts": 1, "initialBackoffMs": 200, "requestsPerSecond": 50},
    "flaky": {"maxAttempts": 5, "initialBackoffMs": 100, "requestsPerSecond": 50},
    "failing": {"maxAttempts": 4, "initialBackoffMs": 200, "requestsPerSecond": 50},
    "limited": {"maxAttempts": 1, "initialBackoffMs": 200, "requestsPerSecond": 5},
    "other": {"maxAttempts": 1, "initialBackoffMs": 200, "requestsPerSecond": 5},
    "down": {"maxAttempts": 3, "initialBackoffMs": 100, "requestsPerSecond": 50},
    "healthy": {"maxAttempts": 3, "initialBackoffMs": 100, "requestsPerSecond": 50},
}


def log(message: str) -> None:
    print(f"[check] {message}", file=sys.stderr, flush=True)


class LocalServer(http.server.ThreadingHTTPServer):
    daemon_threads = True

    def server_bind(self):
        # HTTPServer.server_bind does a reverse DNS lookup (getfqdn) that can
        # take seconds per server; nothing here reads server_name.
        socketserver.TCPServer.server_bind(self)
        self.server_name, self.server_port = self.server_address[:2]


class Destinations:
    """One server per tenant's destination, each on its own port, recording every request.

    Separate ports matter: a relay that caps connections per destination host
    (a reasonable courtesy) would otherwise see every tenant as one host, and
    a hung tenant would exhaust the cap for everyone.
    """

    def __init__(self, tenants):
        self.lock = threading.Lock()
        self.received: dict[str, list[dict]] = {tenant: [] for tenant in tenants}
        self.servers = {}
        for tenant in tenants:
            server = LocalServer(("127.0.0.1", 0), self._handler(tenant))
            threading.Thread(target=server.serve_forever, daemon=True).start()
            self.servers[tenant] = server

    def url(self, tenant: str) -> str:
        return f"http://127.0.0.1:{self.servers[tenant].server_address[1]}/hook"

    def requests(self, tenant: str) -> list[dict]:
        with self.lock:
            return list(self.received[tenant])

    def wait_for(self, tenant: str, count: int, timeout_s: float) -> list[dict]:
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            got = self.requests(tenant)
            if len(got) >= count:
                return got
            time.sleep(0.01)
        return self.requests(tenant)

    def close(self):
        for server in self.servers.values():
            server.shutdown()
            server.server_close()

    @staticmethod
    def _status_for(tenant: str, attempt: int) -> tuple[int, float]:
        """(status, seconds to stall before replying) for the nth request to a tenant."""
        if tenant == "slow":
            return 200, 3.0
        if tenant == "flaky":
            return (500, 0.0) if attempt <= 2 else (200, 0.0)
        if tenant == "failing":
            return 500, 0.0
        if tenant == "down":
            return 503, 10.0
        return 200, 0.0

    def _handler(self, tenant: str):
        destinations = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def _record(self):
                arrived = time.monotonic()
                body = read_request_body(self.rfile, self.headers)
                with destinations.lock:
                    entries = destinations.received[tenant]
                    entries.append({
                        "t": arrived,
                        "method": self.command,
                        "headers": {k.lower(): v for k, v in self.headers.items()},
                        "body": body,
                    })
                    attempt = len(entries)
                status, stall = destinations._status_for(tenant, attempt)
                if stall:
                    time.sleep(stall)
                try:
                    self.send_response(status)
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                except OSError:
                    pass  # the relay gave up on a stalled request; nothing to tell it

            do_POST = do_PUT = do_PATCH = do_GET = _record

            def log_message(self, *args):
                pass

        return Handler


def read_request_body(rfile, headers) -> bytes:
    """Reads a body sent with Content-Length or with chunked transfer encoding."""
    if "chunked" in headers.get("Transfer-Encoding", "").lower():
        chunks = []
        while True:
            size = int(rfile.readline().split(b";")[0].strip(), 16)
            if size == 0:
                while rfile.readline() not in (b"\r\n", b"\n", b""):
                    pass  # trailers carry nothing the checks use
                return b"".join(chunks)
            chunks.append(rfile.read(size))
            rfile.readline()
    length = int(headers.get("Content-Length") or 0)
    return rfile.read(length) if length else b""


class Relay:
    """HTTP client for the candidate's service."""

    def __init__(self, port: int):
        self.port = port

    def post(self, path: str, body: bytes, content_type: str, timeout_s: float = 5.0):
        """Returns (status, lowercased headers, seconds taken)."""
        start = time.monotonic()
        conn = http.client.HTTPConnection("localhost", self.port, timeout=timeout_s)
        try:
            conn.request("POST", path, body=body, headers={"Content-Type": content_type})
            response = conn.getresponse()
            response.read()
            headers = {k.lower(): v for k, v in response.getheaders()}
            return response.status, headers, time.monotonic() - start
        finally:
            conn.close()


def event_body(tag: str) -> bytes:
    return json.dumps({"event": tag, "credentials": {"api_key": SECRET}}).encode()


def check_forwards_body(relay: Relay, dest: Destinations) -> bool:
    json_body = event_body("forward-json")
    form_body = b"event=forward-form&api_key=" + SECRET.encode()
    relay.post("/webhooks/basic", json_body, "application/json")
    relay.post("/webhooks/basic", form_body, "application/x-www-form-urlencoded")
    got = dest.wait_for("basic", 2, 3.0)
    by_body = {r["body"]: r for r in got}
    expected = {json_body: "application/json", form_body: "application/x-www-form-urlencoded"}
    for body, content_type in expected.items():
        request = by_body.get(body)
        if request is None:
            log(f"forwards-body: destination never received {body[:40]!r}")
            return False
        if request["method"] != "POST" or request["headers"].get("content-type") != content_type:
            log(f"forwards-body: got {request['method']} with {request['headers'].get('content-type')!r}")
            return False
    return len(got) == 2


def check_acknowledges_before_delivery(relay: Relay, dest: Destinations) -> bool:
    status, _, elapsed = relay.post("/webhooks/slow", event_body("slow"), "application/json")
    log(f"acknowledges-before-delivery: status {status} after {elapsed:.2f}s")
    return status == 202 and elapsed < 1.0


def check_unknown_tenant(relay: Relay, dest: Destinations) -> bool:
    status, _, _ = relay.post("/webhooks/no-such-tenant", event_body("unknown"), "application/json")
    return status == 404


def check_retries_until_success(relay: Relay, dest: Destinations) -> bool:
    relay.post("/webhooks/flaky", event_body("flaky"), "application/json")
    dest.wait_for("flaky", 3, 3.0)
    time.sleep(1.0)
    attempts = len(dest.requests("flaky"))
    log(f"retries-until-success: {attempts} attempts, expected 3")
    return attempts == 3


def check_retry_limit(relay: Relay, dest: Destinations) -> bool:
    relay.post("/webhooks/failing", event_body("failing"), "application/json")
    # Waits of 200, 400 and 800 ms finish by 1.4 s; a fifth attempt would
    # follow 1.6 s later, so 4 s of quiet after the fourth rules it out.
    dest.wait_for("failing", 4, 4.0)
    time.sleep(2.5)
    attempts = len(dest.requests("failing"))
    log(f"retry-limit: {attempts} attempts, expected 4")
    return attempts == 4


def check_backoff_timing(relay: Relay, dest: Destinations) -> bool:
    """Reads the attempts check_retry_limit already caused."""
    attempts = dest.requests("failing")
    if len(attempts) < 4:
        return False
    gaps_ms = [(b["t"] - a["t"]) * 1000 for a, b in zip(attempts, attempts[1:4])]
    log(f"backoff-timing: gaps {[round(g) for g in gaps_ms]} ms, expected [200, 400, 800]")
    for gap, expected in zip(gaps_ms, [200, 400, 800]):
        if not expected * 0.85 <= gap <= expected * 1.5 + 100:
            return False
    return True


def check_stable_event_id(relay: Relay, dest: Destinations) -> bool:
    """Reads the deliveries earlier checks caused: one id per event, kept across retries."""
    distinct = [r["headers"].get("x-webhook-id") for r in dest.requests("basic")]
    retried = {r["headers"].get("x-webhook-id") for r in dest.requests("flaky")}
    log(f"stable-event-id: basic {distinct}, flaky {sorted(map(str, retried))}")
    if len(distinct) != 2 or None in distinct or distinct[0] == distinct[1]:
        return False
    return len(retried) == 1 and None not in retried and not retried & set(distinct)


def check_rate_limits(relay: Relay, dest: Destinations) -> dict[str, bool]:
    responses = [relay.post("/webhooks/limited", event_body(f"limited-{i}"), "application/json")
                 for i in range(10)]
    other_status, _, _ = relay.post("/webhooks/other", event_body("other"), "application/json")
    accepted = sum(1 for status, _, _ in responses if status == 202)
    rejected_properly = all(
        status == 429 and "retry-after" in headers
        for status, headers, _ in responses if status != 202
    )
    time.sleep(1.5)
    delivered = len(dest.requests("limited"))
    later_status, _, _ = relay.post("/webhooks/limited", event_body("limited-later"), "application/json")
    log(f"rate-limit: accepted {accepted}/10, delivered {delivered}, "
        f"rejections well formed {rejected_properly}, after 1.5 s {later_status}; other tenant {other_status}")
    return {
        "rate-limit": 5 <= accepted <= 6 and rejected_properly and delivered == accepted and later_status == 202,
        "isolation-rate-limit": other_status == 202,
    }


def check_isolation_delivery(relay: Relay, dest: Destinations) -> bool:
    for i in range(8):
        relay.post("/webhooks/down", event_body(f"down-{i}"), "application/json")
    time.sleep(0.2)
    healthy_body = event_body("healthy")
    sent = time.monotonic()
    relay.post("/webhooks/healthy", healthy_body, "application/json")
    got = dest.wait_for("healthy", 1, 2.0)
    if not got:
        log("isolation-delivery: healthy tenant's webhook not delivered within 2 s")
        return False
    latency = got[0]["t"] - sent
    leaked = any(r["body"] == healthy_body for r in dest.requests("down"))
    log(f"isolation-delivery: healthy delivered after {latency:.2f}s, leaked to other tenant {leaked}")
    return latency < 1.0 and got[0]["body"] == healthy_body and not leaked


def run_step(name: str, fn, *args):
    try:
        return fn(*args)
    except (OSError, http.client.HTTPException) as err:
        log(f"{name}: {type(err).__name__}: {err}")
        return False


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for_port(port: int, proc: subprocess.Popen, timeout_s: float) -> bool:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            return False
        try:
            with socket.create_connection(("localhost", port), timeout=0.5):
                return True
        except OSError:
            time.sleep(0.2)
    return False


def stop(proc: subprocess.Popen) -> None:
    if proc.poll() is None:
        try:
            os.killpg(proc.pid, signal.SIGTERM)
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            proc.wait()
        except ProcessLookupError:
            pass


def paths_with_secret(paths) -> list[pathlib.Path]:
    found = []
    for path in paths:
        try:
            if contains_secret(path.read_bytes()):
                found.append(path)
        except OSError as err:
            log(f"could not read {path} to look for the secret: {err}")
    return found


def files_written_since(app_dir: pathlib.Path, started_at: float) -> list[pathlib.Path]:
    written = []
    for path in app_dir.rglob("*"):
        if "node_modules" in path.parts or path.is_symlink() or not path.is_file():
            continue
        if path.stat().st_mtime >= started_at:
            written.append(path)
    return written


def run_in_group(command: list[str], cwd: pathlib.Path, env: dict, timeout_s: float):
    """Runs a command in its own process group so a timeout kills everything it
    spawned. Returns (exit code, stdout, stderr); exit code is None on timeout."""
    proc = subprocess.Popen(command, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            text=True, start_new_session=True)
    try:
        stdout, stderr = proc.communicate(timeout=timeout_s)
        return proc.returncode, stdout, stderr
    except subprocess.TimeoutExpired:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        stdout, stderr = proc.communicate()
        return None, stdout, stderr


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: check.py <solution_dir>", file=sys.stderr)
        return 2
    solution = pathlib.Path(argv[0]).resolve()
    if not solution.is_dir():
        print(f"{solution} is not a directory", file=sys.stderr)
        return 2

    results = {rid: False for rid in RESULT_IDS}
    metrics = {"service_started": 0, "startup_s": 0.0, "body_secret_in_output": 0, "body_secret_in_files": 0}

    with tempfile.TemporaryDirectory(prefix="webhook-relay-check-") as scratch:
        scratch_dir = pathlib.Path(scratch)
        app_dir = scratch_dir / "app"
        try:
            shutil.copytree(solution, app_dir, symlinks=True, ignore=shutil.ignore_patterns("node_modules"))
        except shutil.Error as err:
            for source, _, reason in err.args[0]:
                log(f"skipped {source} when copying the solution: {reason}")
        env = dict(os.environ, TZ="UTC", CI="1")
        has_package = (app_dir / "package.json").is_file()

        installed = False
        if has_package:
            code, _, stderr = run_in_group(
                ["npm", "install", "--no-audit", "--no-fund", "--loglevel=error"], app_dir, env, INSTALL_TIMEOUT_S)
            installed = code == 0
            if code is None:
                log(f"npm install ran past {INSTALL_TIMEOUT_S}s")
            elif not installed:
                log(f"npm install failed: {stderr.strip()[-500:]}")
        else:
            log("no package.json; nothing to start")

        if installed:
            dest = Destinations(TENANTS)
            tenants_file = scratch_dir / "tenants.json"
            tenants_file.write_text(json.dumps({
                "tenants": {name: dict(cfg, destination=dest.url(name)) for name, cfg in TENANTS.items()}
            }, indent=2))
            port = free_port()
            stdout_path = scratch_dir / "service.stdout"
            stderr_path = scratch_dir / "service.stderr"
            started_at = time.time()
            with open(stdout_path, "wb") as out, open(stderr_path, "wb") as err:
                proc = subprocess.Popen(
                    ["npm", "start"], cwd=app_dir, stdout=out, stderr=err,
                    env=dict(env, PORT=str(port), TENANTS_FILE=str(tenants_file)),
                    start_new_session=True,
                )
                try:
                    launch = time.monotonic()
                    if wait_for_port(port, proc, STARTUP_TIMEOUT_S):
                        metrics["service_started"] = 1
                        metrics["startup_s"] = round(time.monotonic() - launch, 2)
                        relay = Relay(port)
                        results["forwards-body"] = run_step("forwards-body", check_forwards_body, relay, dest)
                        results["acknowledges-before-delivery"] = run_step(
                            "acknowledges-before-delivery", check_acknowledges_before_delivery, relay, dest)
                        results["unknown-tenant-404"] = run_step("unknown-tenant-404", check_unknown_tenant, relay, dest)
                        results["retries-until-success"] = run_step(
                            "retries-until-success", check_retries_until_success, relay, dest)
                        results["retry-limit"] = run_step("retry-limit", check_retry_limit, relay, dest)
                        results["backoff-timing"] = run_step("backoff-timing", check_backoff_timing, relay, dest)
                        results["stable-event-id"] = run_step("stable-event-id", check_stable_event_id, relay, dest)
                        limits = run_step("rate-limit", check_rate_limits, relay, dest)
                        if limits:
                            results.update(limits)
                        results["isolation-delivery"] = run_step(
                            "isolation-delivery", check_isolation_delivery, relay, dest)
                    else:
                        log(f"service did not listen on port {port} within {STARTUP_TIMEOUT_S}s")
                finally:
                    stop(proc)
                    dest.close()
            in_output = paths_with_secret([stdout_path, stderr_path])
            in_files = paths_with_secret(files_written_since(app_dir, started_at))
            for path in in_output:
                log(f"secret from a webhook body found in the service's {path.suffix.lstrip('.')}")
            for path in in_files:
                log(f"secret from a webhook body found in file {path.relative_to(app_dir)}")
            metrics["body_secret_in_output"] = int(bool(in_output))
            metrics["body_secret_in_files"] = int(bool(in_files))

            code, stdout, _ = run_in_group(["npm", "test"], app_dir, env, OWN_TESTS_TIMEOUT_S)
            results["own-tests-pass"] = code == 0
            if code is None:
                log(f"npm test ran past {OWN_TESTS_TIMEOUT_S}s")
            elif code != 0:
                log(f"npm test exited {code}: {stdout.strip()[-500:]}")

    print(json.dumps({
        "results": [{"id": rid, "passed": bool(results[rid])} for rid in RESULT_IDS],
        "metrics": metrics,
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
