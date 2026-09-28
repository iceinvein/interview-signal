"""Checks for the perf task wrapper. Needs network access to GitHub.

Run with: python3 -m unittest tasks/perf/anthropic-original/test_task.py
"""

import json
import pathlib
import shutil
import subprocess
import tempfile
import unittest

TASK = pathlib.Path(__file__).resolve().parent
REPO = TASK.parent.parent.parent
PIN = "5452f74bd977807ac2e74f3d29432b9df6f25197"
# The cycle count the unmodified upstream kernel reaches; the upstream
# submission tests call it BASELINE and the README calls it the slowest start.
UPSTREAM_BASELINE_CYCLES = 147734

BROKEN_KERNEL = '''
from problem import DebugInfo


class KernelBuilder:
    def __init__(self):
        self.instrs = []

    def debug_info(self):
        return DebugInfo(scratch_map={})

    def build_kernel(self, forest_height, n_nodes, batch_size, rounds):
        pass
'''

# A tests/ folder that would report success for any kernel if it were used.
ALWAYS_PASSING_TESTS = '''
import unittest


class CorrectnessTests(unittest.TestCase):
    def test_kernel_correctness(self):
        pass


def do_kernel_test(forest_height, rounds, batch_size):
    return 1
'''


class TempDir(unittest.TestCase):
    def setUp(self):
        self.tmp = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)

    def fetch(self, dest):
        subprocess.run([str(TASK / "fetch.sh"), str(dest)], check=True, capture_output=True)

    def score(self, solution):
        proc = subprocess.run(
            [str(TASK / "hidden" / "run.sh"), str(solution)],
            capture_output=True,
            text=True,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        return json.loads(proc.stdout)


class Fetch(TempDir):
    def test_fetch_checks_out_the_pinned_upstream_commit(self):
        dest = self.tmp / "x"
        self.fetch(dest)
        head = subprocess.run(
            ["git", "-C", str(dest), "rev-parse", "HEAD"], capture_output=True, text=True, check=True
        ).stdout.strip()
        self.assertEqual(head, PIN)
        self.assertTrue((dest / "perf_takehome.py").is_file())
        self.assertTrue((dest / "tests" / "submission_tests.py").is_file())

    def test_fetch_makes_the_readme_tests_diff_command_work(self):
        # The upstream README tells candidates to check `git diff origin/main tests/`.
        dest = self.tmp / "x"
        self.fetch(dest)
        (dest / "tests" / "submission_tests.py").write_text("changed\n")
        diff = subprocess.run(
            ["git", "-C", str(dest), "diff", "--stat", "origin/main", "tests/"],
            capture_output=True, text=True, check=True,
        ).stdout
        self.assertIn("submission_tests.py", diff)

    def test_fetch_into_a_directory_holding_the_workspace_keep_file(self):
        dest = self.tmp / "x"
        dest.mkdir()
        (dest / ".keep").write_text("")
        self.fetch(dest)
        self.assertTrue((dest / "perf_takehome.py").is_file())


class Scoring(TempDir):
    def test_reference_is_correct_at_the_upstream_baseline_cycle_count(self):
        output = self.score(TASK / "reference")
        self.assertEqual(output, {
            "results": [{"id": "correct", "passed": True}],
            "metrics": {"cycles": UPSTREAM_BASELINE_CYCLES},
        })

    def test_fetched_workspace_scores_the_same_as_the_reference(self):
        dest = self.tmp / "run"
        self.fetch(dest)
        output = self.score(dest)
        self.assertEqual(output["metrics"], {"cycles": UPSTREAM_BASELINE_CYCLES})

    def test_kernel_with_wrong_output_is_not_correct_and_has_no_cycles(self):
        solution = self.tmp / "solution"
        solution.mkdir()
        (solution / "perf_takehome.py").write_text(BROKEN_KERNEL)
        output = self.score(solution)
        self.assertEqual(output, {"results": [{"id": "correct", "passed": False}], "metrics": {}})

    def test_edited_tests_folder_in_the_solution_is_ignored(self):
        solution = self.tmp / "solution"
        (solution / "tests").mkdir(parents=True)
        (solution / "perf_takehome.py").write_text(BROKEN_KERNEL)
        (solution / "tests" / "submission_tests.py").write_text(ALWAYS_PASSING_TESTS)
        output = self.score(solution)
        self.assertEqual(output["results"], [{"id": "correct", "passed": False}])

    def test_solution_without_a_kernel_file_is_not_correct(self):
        solution = self.tmp / "solution"
        solution.mkdir()
        (solution / "notes.txt").write_text("gave up\n")
        output = self.score(solution)
        self.assertEqual(output, {"results": [{"id": "correct", "passed": False}], "metrics": {}})


class Prompt(TempDir):
    def test_prompt_is_the_upstream_task_statement_plus_the_time_limit(self):
        dest = self.tmp / "x"
        self.fetch(dest)
        docstring = (dest / "perf_takehome.py").read_text().split('"""')[1]
        statement = docstring.split("# Task\n")[1].strip()
        # The upstream statement is a single bullet; the candidate gets its text.
        statement = statement.removeprefix("- ").replace("\n  ", "\n")
        expected = statement + "\n\nComplete this take-home. You have 2 hours.\n"
        self.assertEqual((TASK / "prompt.md").read_text(), expected)


class Validator(unittest.TestCase):
    def test_check_tasks_reports_ok(self):
        proc = subprocess.run(
            ["python3", str(REPO / "check_tasks.py"), "perf/anthropic-original"],
            capture_output=True, text=True,
        )
        self.assertEqual(proc.stdout.strip(), "ok  perf/anthropic-original", proc.stdout + proc.stderr)
        self.assertEqual(proc.returncode, 0)


if __name__ == "__main__":
    unittest.main()
