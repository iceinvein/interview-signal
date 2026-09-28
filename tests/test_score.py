import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest

REPO = pathlib.Path(__file__).resolve().parent.parent
FIXTURE_TASKS = REPO / "tests" / "fixtures" / "scorer"
sys.path.insert(0, str(REPO))

import score  # noqa: E402


class RunDirs(unittest.TestCase):
    """Builds run directories the way run.sh leaves them, against fixture tasks."""

    def setUp(self):
        self.tmp = pathlib.Path(tempfile.mkdtemp()).resolve()
        self.addCleanup(shutil.rmtree, self.tmp)
        self.runs = self.tmp / "runs"

    def make_run(self, task, source, agent="sonnet", rep=1):
        run = self.runs / f"takehome__{task}__{agent}__r{rep}"
        shutil.copytree(FIXTURE_TASKS / "takehome" / task / source, run / "output")
        result = {"format": "takehome", "task": task, "agent": agent, "rep": rep,
                  "wall_s": 1.0, "cli": "fixture", "model": "fixture", "is_error": False,
                  "cost_usd": 0.0, "turns": 1}
        (run / "result.json").write_text(json.dumps(result))
        return run

    def score_cli(self, *args):
        env = dict(os.environ, RUNS_DIR=str(self.runs), TASKS_DIR=str(FIXTURE_TASKS))
        return subprocess.run([sys.executable, str(REPO / "score.py"), *args],
                              capture_output=True, text=True, env=env)


class ScoreRun(RunDirs):
    def test_reference_output_passes_every_result_and_auto_criterion(self):
        scored = score.score_run(self.make_run("answer", "reference"), tasks_dir=FIXTURE_TASKS)
        self.assertEqual(scored["results"], [
            {"id": "answer", "passed": True},
            {"id": "present", "passed": True},
            {"id": "utc", "passed": True},
        ])
        self.assertEqual(scored["auto_criteria"], [
            {"id": "answer-correct", "passed": True},
            {"id": "answer-present", "passed": True},
        ])

    def test_workspace_output_fails_only_the_criterion_its_result_fails(self):
        scored = score.score_run(self.make_run("answer", "workspace"), tasks_dir=FIXTURE_TASKS)
        self.assertEqual(scored["auto_criteria"], [
            {"id": "answer-correct", "passed": False},
            {"id": "answer-present", "passed": True},
        ])

    def test_score_carries_the_run_identity_and_checker_metrics(self):
        scored = score.score_run(self.make_run("answer", "workspace", agent="codex", rep=3),
                                 tasks_dir=FIXTURE_TASKS)
        self.assertEqual(
            {k: scored[k] for k in ("format", "task", "agent", "rep", "metrics")},
            {"format": "takehome", "task": "answer", "agent": "codex", "rep": 3,
             "metrics": {"bytes": 2}},
        )

    def test_score_is_written_to_score_json(self):
        run = self.make_run("answer", "reference")
        scored = score.score_run(run, tasks_dir=FIXTURE_TASKS)
        self.assertEqual(json.loads((run / "score.json").read_text()), scored)

    def test_checker_stderr_is_kept_in_the_run_directory(self):
        run = self.make_run("answer", "reference")
        score.score_run(run, tasks_dir=FIXTURE_TASKS)
        self.assertEqual((run / "score_stderr.txt").read_text(),
                         f"checked {run / 'output'}/answer.txt under TZ=UTC\n")

    def test_checker_that_breaks_raises_and_writes_no_score(self):
        run = self.make_run("broken", "reference")
        with self.assertRaisesRegex(score.ScoringError, "exited 3"):
            score.score_run(run, tasks_dir=FIXTURE_TASKS)
        self.assertFalse((run / "score.json").exists())
        self.assertEqual((run / "score_stderr.txt").read_text(), "checker exploded\n")

    def test_auto_criterion_naming_an_unreported_result_raises(self):
        tasks = self.tmp / "tasks"
        shutil.copytree(FIXTURE_TASKS, tasks)
        rubric_path = tasks / "takehome" / "answer" / "rubric.json"
        rubric = json.loads(rubric_path.read_text())
        rubric["criteria"][0]["test_id"] = "no-such-result"
        rubric_path.write_text(json.dumps(rubric))
        with self.assertRaisesRegex(score.ScoringError, "no-such-result"):
            score.score_run(self.make_run("answer", "reference"), tasks_dir=tasks)


class Cli(RunDirs):
    def test_every_finished_run_gets_a_score_and_the_summary_counts_passes(self):
        self.make_run("answer", "reference", rep=1)
        self.make_run("answer", "workspace", rep=2)
        proc = self.score_cli()
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertTrue((self.runs / "takehome__answer__sonnet__r1" / "score.json").is_file())
        self.assertTrue((self.runs / "takehome__answer__sonnet__r2" / "score.json").is_file())
        self.assertIn("answer-correct", proc.stdout)
        self.assertRegex(proc.stdout, r"answer-correct\s+1/2")
        self.assertRegex(proc.stdout, r"answer-present\s+2/2")

    def test_run_without_result_json_is_not_scored(self):
        run = self.make_run("answer", "reference")
        (run / "result.json").unlink()
        proc = self.score_cli()
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertFalse((run / "score.json").exists())

    def test_cached_score_is_kept_unless_rescore_is_asked_for(self):
        run = self.make_run("answer", "workspace")
        self.assertEqual(self.score_cli().returncode, 0)
        (run / "output" / "answer.txt").write_text("42")

        self.assertEqual(self.score_cli().returncode, 0)
        cached = json.loads((run / "score.json").read_text())
        self.assertEqual(cached["auto_criteria"][0], {"id": "answer-correct", "passed": False})

        self.assertEqual(self.score_cli("--rescore").returncode, 0)
        rescored = json.loads((run / "score.json").read_text())
        self.assertEqual(rescored["auto_criteria"][0], {"id": "answer-correct", "passed": True})

    def test_broken_checker_fails_the_command_but_other_runs_are_scored(self):
        good = self.make_run("answer", "reference")
        self.make_run("broken", "reference")
        proc = self.score_cli()
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("takehome__broken__sonnet__r1", proc.stderr)
        self.assertTrue((good / "score.json").is_file())

    def test_failed_rescore_leaves_no_stale_score(self):
        run = self.make_run("answer", "reference")
        self.assertEqual(self.score_cli().returncode, 0)
        result = json.loads((run / "result.json").read_text())
        result["task"] = "broken"
        (run / "result.json").write_text(json.dumps(result))
        proc = self.score_cli("--rescore")
        self.assertNotEqual(proc.returncode, 0)
        self.assertFalse((run / "score.json").exists())


if __name__ == "__main__":
    unittest.main()
