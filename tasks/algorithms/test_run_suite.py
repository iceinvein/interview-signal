"""Tests for run_suite.py. Run as a script, python3 tasks/algorithms/test_run_suite.py,
so no __pycache__ is written under tasks/algorithms/."""

import contextlib
import io
import json
import pathlib
import shutil
import sys
import tempfile
import unittest

# A __pycache__ directory here would be read by check_tasks.py as a task.
sys.dont_write_bytecode = True
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import run_suite  # noqa: E402

SUITE = """
let double: (typeof import("./solution.ts"))["double"];
beforeAll(async () => {
  ({ double } = await import("./solution.ts"));
});
describe("small", () => {
  it("doubles one", () => expect(double(1)).toBe(2));
  it("doubles zero", () => expect(double(0)).toBe(0));
});
describe("negative", () => {
  it("doubles minus three", () => expect(double(-3)).toBe(-6));
});
"""

CORRECT = "export function double(n: number): number { return n * 2; }\n"
WRONG_ON_NEGATIVES = "export function double(n: number): number { return Math.abs(n) * 2; }\n"


class RunSuite(unittest.TestCase):
    def setUp(self):
        self.tmp = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)
        self.suite = self.tmp / "suite.test.ts"
        self.suite.write_text(SUITE)
        self.solution_dir = self.tmp / "candidate"
        self.solution_dir.mkdir()

    def write_solution(self, source):
        (self.solution_dir / "solution.ts").write_text(source)

    def run_suite(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = run_suite.main([str(self.suite), str(self.solution_dir)])
        self.assertEqual(code, 0)
        return json.loads(out.getvalue())

    def test_correct_solution_passes_every_group_and_all_cases(self):
        self.write_solution(CORRECT)
        output = self.run_suite()
        self.assertEqual(
            output["results"],
            [
                {"id": "small", "passed": True},
                {"id": "negative", "passed": True},
                {"id": "all-cases", "passed": True},
            ],
        )
        self.assertEqual(output["metrics"], {"cases_total": 3, "cases_passed": 3, "timed_out": 0})

    def test_one_failing_case_fails_its_group_and_all_cases_only(self):
        self.write_solution(WRONG_ON_NEGATIVES)
        output = self.run_suite()
        self.assertEqual(
            output["results"],
            [
                {"id": "small", "passed": True},
                {"id": "negative", "passed": False},
                {"id": "all-cases", "passed": False},
            ],
        )
        self.assertEqual(output["metrics"]["cases_passed"], 2)

    def test_missing_solution_fails_every_group_without_breaking_the_checker(self):
        output = self.run_suite()
        self.assertEqual([r["passed"] for r in output["results"]], [False, False, False])
        self.assertEqual(output["metrics"]["cases_total"], 3)

    def test_solution_that_does_not_parse_fails_every_group(self):
        self.write_solution("export function double(n: number {\n")
        output = self.run_suite()
        self.assertEqual([r["passed"] for r in output["results"]], [False, False, False])

    def test_solution_that_never_returns_is_killed_and_fails_every_group(self):
        self.write_solution("export function double(n: number): number { while (true) {} }\n")
        original = run_suite.RUN_TIMEOUT_S
        run_suite.RUN_TIMEOUT_S = 10
        self.addCleanup(setattr, run_suite, "RUN_TIMEOUT_S", original)
        output = self.run_suite()
        self.assertEqual(
            output["results"],
            [
                {"id": "small", "passed": False},
                {"id": "negative", "passed": False},
                {"id": "all-cases", "passed": False},
            ],
        )
        self.assertEqual(output["metrics"]["timed_out"], 1)


if __name__ == "__main__":
    unittest.main()
