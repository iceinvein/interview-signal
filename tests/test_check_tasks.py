import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest

REPO = pathlib.Path(__file__).resolve().parent.parent
FIXTURES = REPO / "tests" / "fixtures"
sys.path.insert(0, str(REPO))

import check_tasks  # noqa: E402


class MutableTask(unittest.TestCase):
    """Copies the good fixture so a test can break one thing about it."""

    def setUp(self):
        self.tmp = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)
        self.task = self.tmp / "good"
        shutil.copytree(FIXTURES / "good", self.task)

    def edit_json(self, name, change):
        path = self.task / name
        doc = json.loads(path.read_text())
        change(doc)
        path.write_text(json.dumps(doc))

    def write_run_sh(self, body):
        (self.task / "hidden" / "run.sh").write_text("#!/usr/bin/env bash\n" + body)


class FixtureTasks(unittest.TestCase):
    def test_good_fixture_has_no_problems(self):
        self.assertEqual(check_tasks.check(FIXTURES / "good"), [])

    def test_reference_that_fails_a_result_is_reported(self):
        problems = check_tasks.check(FIXTURES / "bad-reference")
        self.assertEqual(len(problems), 1, problems)
        self.assertIn("reference", problems[0])
        self.assertIn("answer", problems[0])


class Layout(MutableTask):
    def test_missing_layout_file_is_named(self):
        (self.task / "rubric.json").unlink()
        problems = check_tasks.check(self.task)
        self.assertTrue(any("rubric.json" in p for p in problems), problems)

    def test_missing_reference_dir_is_named(self):
        shutil.rmtree(self.task / "reference")
        problems = check_tasks.check(self.task)
        self.assertTrue(any("reference" in p for p in problems), problems)

    def test_run_sh_that_is_not_executable_is_reported(self):
        (self.task / "hidden" / "run.sh").chmod(0o644)
        problems = check_tasks.check(self.task)
        self.assertTrue(any("executable" in p for p in problems), problems)


class Meta(MutableTask):
    def test_unknown_format_is_reported(self):
        self.edit_json("meta.json", lambda m: m.update(format="whiteboard"))
        problems = check_tasks.check(self.task)
        self.assertEqual(len(problems), 1, problems)
        self.assertIn("format", problems[0])

    def test_missing_key_is_reported(self):
        self.edit_json("meta.json", lambda m: m.pop("license"))
        problems = check_tasks.check(self.task)
        self.assertEqual(len(problems), 1, problems)
        self.assertIn("license", problems[0])

    def test_non_string_variant_is_reported(self):
        self.edit_json("meta.json", lambda m: m.update(variant=3))
        problems = check_tasks.check(self.task)
        self.assertEqual(len(problems), 1, problems)
        self.assertIn("variant", problems[0])

    def test_extra_keys_are_allowed(self):
        self.edit_json("meta.json", lambda m: m.update(baselines={"url": "x"}))
        self.assertEqual(check_tasks.check(self.task), [])

    def test_invalid_json_is_reported(self):
        (self.task / "meta.json").write_text("{not json")
        problems = check_tasks.check(self.task)
        self.assertTrue(any("meta.json" in p for p in problems), problems)


class Rubric(MutableTask):
    def test_auto_criterion_naming_unknown_result_is_reported(self):
        self.edit_json(
            "rubric.json", lambda r: r["criteria"][0].update(test_id="no-such-result")
        )
        problems = check_tasks.check(self.task)
        self.assertEqual(len(problems), 1, problems)
        self.assertIn("no-such-result", problems[0])

    def test_auto_criterion_without_test_id_is_reported(self):
        self.edit_json("rubric.json", lambda r: r["criteria"][0].update(test_id=None))
        problems = check_tasks.check(self.task)
        self.assertEqual(len(problems), 1, problems)
        self.assertIn("answer-correct", problems[0])

    def test_unknown_kind_is_reported(self):
        self.edit_json("rubric.json", lambda r: r["criteria"][1].update(kind="vibes"))
        problems = check_tasks.check(self.task)
        self.assertEqual(len(problems), 1, problems)
        self.assertIn("kind", problems[0])

    def test_duplicate_criterion_id_is_reported(self):
        self.edit_json("rubric.json", lambda r: r["criteria"][1].update(id="answer-correct"))
        problems = check_tasks.check(self.task)
        self.assertEqual(len(problems), 1, problems)
        self.assertIn("answer-correct", problems[0])

    def test_empty_criteria_is_reported(self):
        self.edit_json("rubric.json", lambda r: r.update(criteria=[]))
        problems = check_tasks.check(self.task)
        self.assertEqual(len(problems), 1, problems)
        self.assertIn("criteria", problems[0])

    def test_trap_object_is_accepted(self):
        self.edit_json("rubric.json", lambda r: r.update(trap={"id": "t", "text": "x"}))
        self.assertEqual(check_tasks.check(self.task), [])

    def test_trap_without_text_is_reported(self):
        self.edit_json("rubric.json", lambda r: r.update(trap={"id": "t"}))
        problems = check_tasks.check(self.task)
        self.assertEqual(len(problems), 1, problems)
        self.assertIn("trap", problems[0])


class HiddenChecks(MutableTask):
    def test_workspace_that_passes_everything_is_reported(self):
        shutil.copy(self.task / "reference" / "answer.txt", self.task / "workspace")
        problems = check_tasks.check(self.task)
        self.assertEqual(len(problems), 1, problems)
        self.assertIn("workspace", problems[0])

    def test_baseline_passes_variant_waives_the_workspace_rule(self):
        shutil.copy(self.task / "reference" / "answer.txt", self.task / "workspace")
        self.edit_json("meta.json", lambda m: m.update(variant="baseline-passes"))
        self.assertEqual(check_tasks.check(self.task), [])

    def test_run_sh_exiting_non_zero_is_reported(self):
        self.write_run_sh("echo broken >&2\nexit 3\n")
        problems = check_tasks.check(self.task)
        self.assertTrue(any("exited 3" in p for p in problems), problems)

    def test_run_sh_printing_non_json_is_reported(self):
        self.write_run_sh("echo all good\n")
        problems = check_tasks.check(self.task)
        self.assertTrue(any("JSON" in p for p in problems), problems)

    def test_run_sh_output_without_metrics_is_reported(self):
        self.write_run_sh('echo \'{"results": [{"id": "answer", "passed": true}]}\'\n')
        problems = check_tasks.check(self.task)
        self.assertTrue(any("metrics" in p for p in problems), problems)

    def test_reference_with_no_results_is_reported(self):
        self.write_run_sh('echo \'{"results": [], "metrics": {}}\'\n')
        problems = check_tasks.check(self.task)
        self.assertTrue(any("no results" in p for p in problems), problems)

    def test_run_sh_receives_absolute_solution_dir_for_relative_task_path(self):
        # run.sh may change directory, so a relative argument would point
        # nowhere; check() must hand it an absolute path.
        previous = os.getcwd()
        os.chdir(self.tmp)
        self.addCleanup(os.chdir, previous)
        self.write_run_sh(
            'cd /\n'
            'if [[ -f "$1/answer.txt" && "$(cat "$1/answer.txt")" == 42 ]]; then p=true; else p=false; fi\n'
            'printf \'{"results": [{"id": "answer", "passed": %s}], "metrics": {}}\' "$p"\n'
        )
        self.assertEqual(check_tasks.check(pathlib.Path("good")), [])


class Prompt(MutableTask):
    def test_each_forbidden_word_is_reported(self):
        for word in ["rubric", "Trap", "planted", "HIDDEN"]:
            with self.subTest(word=word):
                (self.task / "prompt.md").write_text(f"Mind the {word} tests.\n")
                problems = check_tasks.check(self.task)
                self.assertEqual(len(problems), 1, problems)
                self.assertIn(word.lower(), problems[0].lower())

    def test_forbidden_word_inside_another_word_is_allowed(self):
        (self.task / "prompt.md").write_text("Tighten the strap on the trapezoid.\n")
        self.assertEqual(check_tasks.check(self.task), [])


class Cli(unittest.TestCase):
    def setUp(self):
        self.root = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.root)
        shutil.copy(REPO / "check_tasks.py", self.root)
        for name in ["good", "bad-reference"]:
            shutil.copytree(FIXTURES / name, self.root / "tasks" / "takehome" / name)

    def run_cli(self, *args):
        return subprocess.run(
            [sys.executable, str(self.root / "check_tasks.py"), *args],
            capture_output=True,
            text=True,
            cwd="/",
        )

    def test_named_valid_task_prints_ok_and_exits_zero(self):
        proc = self.run_cli("takehome/good")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(proc.stdout, "ok  takehome/good\n")

    def test_named_invalid_task_prints_fail_with_indented_problems(self):
        proc = self.run_cli("takehome/bad-reference")
        self.assertEqual(proc.returncode, 1, proc.stderr)
        lines = proc.stdout.splitlines()
        self.assertEqual(lines[0], "FAIL takehome/bad-reference")
        self.assertEqual(len(lines), 2)
        self.assertTrue(lines[1].startswith("  "), lines)

    def test_no_arguments_checks_every_task(self):
        proc = self.run_cli()
        self.assertEqual(proc.returncode, 1, proc.stderr)
        lines = proc.stdout.splitlines()
        self.assertIn("ok  takehome/good", lines)
        self.assertIn("FAIL takehome/bad-reference", lines)

    def test_no_arguments_with_no_tasks_fails(self):
        shutil.rmtree(self.root / "tasks")
        proc = self.run_cli()
        self.assertEqual(proc.returncode, 1)
        self.assertIn("no tasks", proc.stderr)

    def test_unknown_task_fails(self):
        proc = self.run_cli("takehome/nope")
        self.assertEqual(proc.returncode, 1)
        self.assertTrue(proc.stdout.startswith("FAIL takehome/nope\n"), proc.stdout)


if __name__ == "__main__":
    unittest.main()
