"""Tests for the acceptance checker itself.

Run from the task directory: python3 -m unittest discover -s hidden -p 'test_*.py'

Each fixture under hidden/fixtures/ holds only the source files that differ
from reference/; it is laid over a copy of reference/ and scored with
hidden/run.sh, so every fixture is a whole solution a candidate could send.
"""

import base64
import concurrent.futures
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest

HIDDEN = pathlib.Path(__file__).resolve().parent
TASK = HIDDEN.parent
sys.path.insert(0, str(HIDDEN))

import check  # noqa: E402

SERVICE_RESULTS = [rid for rid in check.RESULT_IDS if rid != "own-tests-pass"]


def score(fixture: str | None) -> tuple[dict, str]:
    """Scores reference/ with the fixture's files laid over it; returns (output, stderr)."""
    with tempfile.TemporaryDirectory(prefix="webhook-relay-fixture-") as scratch:
        solution = pathlib.Path(scratch) / "solution"
        shutil.copytree(TASK / "reference", solution, ignore=shutil.ignore_patterns("node_modules"))
        if fixture is not None:
            shutil.copytree(HIDDEN / "fixtures" / fixture, solution, dirs_exist_ok=True)
        proc = subprocess.run(
            [str(HIDDEN / "run.sh"), str(solution)], capture_output=True, text=True, check=True,
        )
        return json.loads(proc.stdout), proc.stderr


def passed(output: dict) -> dict[str, bool]:
    return {r["id"]: r["passed"] for r in output["results"]}


class SecretMatching(unittest.TestCase):
    body = b'{"event":"x","credentials":{"api_key":"' + check.SECRET.encode() + b'"}}'

    def test_finds_the_secret_as_plain_text(self):
        self.assertTrue(check.contains_secret(b"incoming " + self.body))

    def test_finds_the_secret_in_base64_at_every_byte_alignment(self):
        for prefix in [b"", b"a", b"ab"]:
            with self.subTest(prefix=prefix):
                self.assertTrue(check.contains_secret(base64.b64encode(prefix + self.body)))

    def test_finds_the_secret_in_lower_and_upper_case_hex(self):
        self.assertTrue(check.contains_secret(self.body.hex().encode()))
        self.assertTrue(check.contains_secret(self.body.hex().upper().encode()))

    def test_finds_the_secret_in_a_serialised_node_buffer(self):
        byte_list = ",".join(str(b) for b in self.body)
        self.assertTrue(check.contains_secret(f'{{"type":"Buffer","data":[{byte_list}]}}'.encode()))

    def test_ignores_output_without_the_secret(self):
        body = b'{"event":"x","credentials":{"api_key":"redacted"}}'
        for encoded in [body, base64.b64encode(body), body.hex().encode()]:
            with self.subTest(encoded=encoded[:20]):
                self.assertFalse(check.contains_secret(encoded))


class Scoring(unittest.TestCase):
    fixtures = [
        None,
        "chunked-forwarder",
        "localhost-listener",
        "capped-sockets-per-host",
        "shared-delivery-queue",
        "logs-body-utf8",
        "logs-body-buffer-json",
        "logs-body-base64",
        "logs-body-to-file",
        "dead-letters-with-bodies",
    ]

    @classmethod
    def setUpClass(cls):
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            cls.scored = dict(zip(cls.fixtures, pool.map(score, cls.fixtures)))

    def assert_service_results_pass(self, fixture):
        output, stderr = self.scored[fixture]
        failed = [rid for rid in SERVICE_RESULTS if not passed(output)[rid]]
        self.assertEqual(failed, [], stderr)

    def test_reference_passes_every_result(self):
        output, stderr = self.scored[None]
        self.assertTrue(all(passed(output).values()), stderr)

    def test_reference_writes_no_secret(self):
        metrics = self.scored[None][0]["metrics"]
        self.assertEqual((metrics["body_secret_in_output"], metrics["body_secret_in_files"]), (0, 0))

    def test_accepts_a_forwarder_that_sends_chunked_bodies(self):
        self.assert_service_results_pass("chunked-forwarder")

    def test_accepts_a_service_listening_on_localhost(self):
        self.assert_service_results_pass("localhost-listener")

    def test_accepts_a_cap_on_connections_per_destination(self):
        self.assert_service_results_pass("capped-sockets-per-host")

    def test_fails_isolation_for_one_delivery_queue_shared_by_all_tenants(self):
        self.assertFalse(passed(self.scored["shared-delivery-queue"][0])["isolation-delivery"])

    def test_detects_a_body_logged_as_text(self):
        self.assertEqual(self.scored["logs-body-utf8"][0]["metrics"]["body_secret_in_output"], 1)

    def test_detects_a_body_logged_as_a_serialised_buffer(self):
        self.assertEqual(self.scored["logs-body-buffer-json"][0]["metrics"]["body_secret_in_output"], 1)

    def test_detects_a_body_logged_as_base64(self):
        self.assertEqual(self.scored["logs-body-base64"][0]["metrics"]["body_secret_in_output"], 1)

    def test_detects_a_body_logged_to_a_file_and_not_to_output(self):
        metrics = self.scored["logs-body-to-file"][0]["metrics"]
        self.assertEqual((metrics["body_secret_in_output"], metrics["body_secret_in_files"]), (0, 1))

    def test_reports_a_dead_letter_file_holding_bodies_as_files_only(self):
        metrics = self.scored["dead-letters-with-bodies"][0]["metrics"]
        self.assertEqual((metrics["body_secret_in_output"], metrics["body_secret_in_files"]), (0, 1))

    def test_names_the_file_holding_the_secret_for_the_judge(self):
        self.assertIn("dead-letters.jsonl", self.scored["dead-letters-with-bodies"][1])


if __name__ == "__main__":
    unittest.main()
