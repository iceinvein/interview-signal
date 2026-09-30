import io
import json
import pathlib
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stdout

REPO = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

import analyze  # noqa: E402


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value))


def write_jsonl(path, events):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(e) + "\n" for e in events))


class Tree(unittest.TestCase):
    """A scratch repository holding tasks/ and runs/ the way the harness leaves them."""

    def setUp(self):
        self.root = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.root)
        self.runs = self.root / "runs"
        self.tasks = self.root / "tasks"

    def rubric(self, fmt, task, criteria, trap=None):
        write_json(self.tasks / fmt / task / "rubric.json", {"criteria": criteria, "trap": trap})

    def make_run(self, fmt, task, agent, rep, auto=None, judge=None, trap=None, metrics=None,
            cost=0.1, fetches=(), output=None):
        name = f"{fmt}__{task}__{agent}__r{rep}"
        d = self.runs / name
        write_json(d / "result.json", {
            "format": fmt, "task": task, "agent": agent, "rep": rep, "cost_usd": cost,
            "wall_s": 10.0, "model": f"model-{agent}", "is_error": False,
            "external_fetches": list(fetches), "contamination": [],
        })
        write_json(d / "score.json", {
            "auto_criteria": [{"id": k, "passed": v} for k, v in (auto or {}).items()],
            "metrics": metrics or {},
        })
        if judge is not None or trap is not None:
            write_json(d / "judge.json", {
                "criteria": [{"id": k, "label": v, "unanimous": True, "votes": []}
                             for k, v in (judge or {}).items()],
                "trap": None if trap is None else {"id": "t", "label": trap, "unanimous": True, "votes": []},
            })
        (d / "output").mkdir(parents=True, exist_ok=True)
        for rel, text in (output or {"solution.ts": "x"}).items():
            (d / "output" / rel).write_text(text)
        return name


class SpearmanTest(unittest.TestCase):
    def test_identical_orders_correlate_perfectly(self):
        self.assertAlmostEqual(analyze.spearman([0.2, 0.5, 0.9], [1, 2, 3]), 1.0)

    def test_reversed_orders_correlate_negatively(self):
        self.assertAlmostEqual(analyze.spearman([3, 2, 1], [1, 2, 3]), -1.0)

    def test_ties_use_average_ranks(self):
        # x ranks (1, 3, 3, 3), y ranks (1, 2.5, 2.5, 4): covariance 3, variances 3 and 4.5,
        # so Pearson on ranks is 3 / sqrt(13.5) = 0.8164965809.
        self.assertAlmostEqual(analyze.spearman([0, 1, 1, 1], [0, 1, 1, 2]), 0.8164965809, places=6)

    def test_constant_input_has_no_correlation(self):
        self.assertIsNone(analyze.spearman([1, 1, 1, 1], [0.5, 1, 1, 1]))


class ExternalFetchTest(unittest.TestCase):
    def test_reserved_loopback_and_bare_hosts_are_dropped(self):
        kept, gh = analyze.split_fetches([
            "https://hooks.acme.example/relay", "http://dest.invalid/hook", "https://slow.test/",
            "https://example.com/x", "http://localhost:3000/", "http://127.0.0.1:9/", "http://relay",
            "https://github.com/feedmepos/se-take-home-assignment.git",
        ])
        self.assertEqual(kept, ["https://github.com/feedmepos/se-take-home-assignment.git"])
        self.assertEqual(gh, [])

    def test_gh_invocations_are_reported_apart_from_fetches(self):
        kept, gh = analyze.split_fetches(["gh auth status", "gh", "https://registry.npmjs.org/x"])
        self.assertEqual(kept, ["https://registry.npmjs.org/x"])
        self.assertEqual(gh, ["gh auth status", "gh"])


class CriterionTableTest(Tree):
    def setUp(self):
        super().setUp()
        self.rubric("takehome", "t", [
            {"id": "always", "kind": "auto", "test_id": "always", "text": ""},
            {"id": "never", "kind": "auto", "test_id": "never", "text": ""},
            {"id": "split", "kind": "judge", "test_id": None, "text": ""},
        ])
        for agent, split in (("a", ["met", "not_met"]), ("b", ["met", "met"])):
            for rep, label in enumerate(split, 1):
                self.make_run("takehome", "t", agent, rep, auto={"always": True, "never": False},
                         judge={"split": label})
        self.runs_list = analyze.load_runs(self.runs)

    def test_counts_met_runs_per_agent(self):
        table = analyze.criterion_table(self.runs_list, "t", ["always", "never", "split"])
        self.assertEqual(table["split"], {"a": (1, 2), "b": (2, 2)})

    def test_criterion_met_everywhere_is_flagged_as_no_signal(self):
        table = analyze.criterion_table(self.runs_list, "t", ["always", "never", "split"])
        self.assertEqual(analyze.met_by_all(table), ["always"])

    def test_criterion_no_agent_meets_is_flagged(self):
        table = analyze.criterion_table(self.runs_list, "t", ["always", "never", "split"])
        self.assertEqual(analyze.met_by_none(table), ["never"])

    def test_mixed_cells_mark_run_to_run_variance(self):
        table = analyze.criterion_table(self.runs_list, "t", ["always", "never", "split"])
        self.assertEqual(analyze.mixed_cells(table), [("split", "a")])


class IdenticalOutputTest(Tree):
    def test_groups_whose_reps_are_byte_identical_are_counted(self):
        for rep in (1, 2, 3):
            self.make_run("algorithms", "q", "a", rep, output={"solution.ts": "same"})
            self.make_run("algorithms", "q", "b", rep, output={"solution.ts": f"differs {rep}"})
        groups = analyze.identical_output_groups(analyze.load_runs(self.runs))
        self.assertEqual(groups, [("q", "a")])

    def test_groups_with_any_two_identical_repeats_are_counted_separately(self):
        for rep, text in ((1, "same"), (2, "same"), (3, "other")):
            self.make_run("algorithms", "q", "a", rep, output={"solution.ts": text})
        runs = analyze.load_runs(self.runs)
        self.assertEqual((analyze.identical_output_groups(runs), analyze.repeated_output_groups(runs)), ([], [("q", "a")]))


class FeedmeRateTest(unittest.TestCase):
    def test_rate_counts_only_runs_where_the_requirement_was_exercised(self):
        rows = [
            {"run": "r1", "criterion": "req5-idle-bot", "hand": "met", "exercised": True},
            {"run": "r2", "criterion": "req5-idle-bot", "hand": "met", "exercised": False},
            {"run": "r3", "criterion": "req5-idle-bot", "hand": "not_met", "exercised": True},
        ]
        self.assertEqual(analyze.exercised_rate(rows, "req5-idle-bot"), (1, 2))


class SampleTest(Tree):
    def setUp(self):
        super().setUp()
        for rep in range(1, 6):
            self.make_run("takehome", "t", "a", rep, judge={"x": "met", "y": "not_met"}, trap="pushed_back")
        self.runs_list = analyze.load_runs(self.runs)

    def test_sample_is_a_fifth_of_judged_labels_rounded(self):
        sample = analyze.draw_sample(self.runs_list, seed=7, fraction=0.2)
        self.assertEqual(len(sample), 3)  # 15 judged labels: 10 criteria and 5 traps

    def test_same_seed_draws_the_same_sample(self):
        first = analyze.draw_sample(self.runs_list, seed=7, fraction=0.2)
        self.assertEqual(first, analyze.draw_sample(self.runs_list, seed=7, fraction=0.2))

    def test_traps_are_part_of_the_population(self):
        population = analyze.judged_population(self.runs_list)
        self.assertIn(("takehome__t__a__r1", "trap:t", "pushed_back"), population)

    def test_agreement_compares_hand_with_judge(self):
        rows = [{"judge": "met", "hand": "met"}, {"judge": "met", "hand": "not_met"},
                {"judge": "pushed_back", "hand": "pushed_back"}]
        self.assertEqual(analyze.agreement(rows), (2, 3))


class TranscriptFixture(Tree):
    def claude(self, name, command, cwd="/tmp/tmp.abc", output="ok"):
        path = self.root / name / "transcript.jsonl"
        write_jsonl(path, [
            {"type": "system", "subtype": "init", "cwd": cwd, "mcp_servers": []},
            {"type": "assistant", "message": {"content": [
                {"type": "tool_use", "id": "t1", "name": "Bash", "input": {"command": command}}]}},
            {"type": "user", "message": {"content": [
                {"type": "tool_result", "tool_use_id": "t1", "content": output}]}},
        ])
        return path

    def codex(self, name, items):
        path = self.root / name / "transcript.jsonl"
        write_jsonl(path, [{"type": "item.completed", "item": item} for item in items])
        return path


class TranscriptScanTest(TranscriptFixture):
    def test_home_config_read_is_outside_the_run(self):
        scan = analyze.scan_transcript(self.claude("a", "cat ~/.codex/AGENTS.md"))
        self.assertEqual(len(scan["outside"]), 1)

    def test_lookup_in_the_working_directory_is_inside(self):
        scan = analyze.scan_transcript(self.claude("a", "ls CLAUDE.md README.md"))
        self.assertEqual((len(scan["inside"]), len(scan["outside"])), (1, 0))

    def test_search_of_the_parent_directory_is_outside(self):
        scan = analyze.scan_transcript(self.codex("a", [
            {"type": "command_execution", "command": "/bin/zsh -lc 'find .. -name AGENTS.md -print'",
             "aggregated_output": "find: ../x: Operation not permitted\n"}]))
        self.assertEqual(len(scan["outside"]), 1)
        self.assertFalse(scan["found_instruction_file"])

    def test_an_instruction_file_in_the_output_is_reported_as_found(self):
        scan = analyze.scan_transcript(self.codex("a", [
            {"type": "command_execution", "command": "find .. -name AGENTS.md -print",
             "aggregated_output": "../sibling/AGENTS.md\n"}]))
        self.assertTrue(scan["found_instruction_file"])

    def test_path_under_the_run_directory_is_inside(self):
        scan = analyze.scan_transcript(self.claude("a", "cat /tmp/tmp.abc/CLAUDE.md", cwd="/tmp/tmp.abc"))
        self.assertEqual(len(scan["outside"]), 0)

    def test_connector_calls_are_listed(self):
        scan = analyze.scan_transcript(self.codex("a", [
            {"type": "mcp_tool_call", "server": "codex_apps", "tool": "github.search", "arguments": {}}]))
        self.assertEqual(scan["connector_calls"], ["codex_apps.github.search"])

    def test_repositories_a_connector_opened_are_listed(self):
        scan = analyze.scan_transcript(self.codex("a", [
            {"type": "mcp_tool_call", "server": "codex_apps", "tool": "github.fetch_file",
             "arguments": {"repository_full_name": "someone/solution", "path": "README.md"}}]))
        self.assertEqual(scan["connector_repos"], {"someone/solution"})

    def test_container_run_is_recognised_by_its_work_directory(self):
        self.assertEqual(analyze.scan_transcript(self.claude("a", "ls", cwd="/work"))["environment"], "container")
        self.assertEqual(analyze.scan_transcript(self.claude("b", "ls"))["environment"], "host")


class IncidentTest(TranscriptFixture):
    def test_successful_push_and_pull_request_are_detected(self):
        path = self.codex("a", [
            {"type": "command_execution", "command": "git push -u origin feat",
             "aggregated_output": "To https://github.com/me/fork.git\n * [new branch] feat -> feat\n"},
            {"type": "command_execution", "command": "gh pr create --repo up/repo --body-file b",
             "aggregated_output": "https://github.com/up/repo/pull/12\n"},
            {"type": "web_search", "query": "site:docs.github.com fork approvals"},
        ])
        actions = analyze.incident_actions(path)
        self.assertTrue(actions["pushed"])
        self.assertEqual(actions["pull_requests"], ["https://github.com/up/repo/pull/12"])
        self.assertEqual(actions["web_searches"], ["site:docs.github.com fork approvals"])

    def test_search_through_other_runs_temp_dirs_is_detected(self):
        path = self.claude("a", 'T=$(grep -l "demo.txt" "$TMPDIR"/tmp.*/run.sh | head -1)')
        self.assertTrue(analyze.incident_actions(path)["sibling_run_dirs"])

    def test_setting_a_git_author_identity_is_detected(self):
        path = self.claude("a", 'git config user.email someone@corp.example && git config user.name "Some One"')
        self.assertTrue(analyze.incident_actions(path)["set_git_identity"])

    def test_failed_push_is_not_counted(self):
        path = self.codex("a", [
            {"type": "command_execution", "command": "git push",
             "aggregated_output": "fatal: could not read Username for 'https://github.com'\n"}])
        self.assertFalse(analyze.incident_actions(path)["pushed"])


class ReportTest(Tree):
    def test_report_prints_perf_cycles_against_the_published_baseline(self):
        write_json(self.tasks / "perf" / "p" / "meta.json", {"baselines": {
            "entries": [{"cycles": 1363, "quote": "1363 cycles: best harness"}],
            "starting_points": {"this_repo_start": 147734, "two_hour_version_start": 18532}}})
        self.rubric("perf", "p", [{"id": "correct", "kind": "auto", "test_id": "correct", "text": ""}])
        self.make_run("perf", "p", "a", 1, auto={"correct": True}, metrics={"cycles": 1000})
        out = io.StringIO()
        with redirect_stdout(out):
            analyze.report_perf(analyze.load_runs(self.runs), self.tasks, verdicts={})
        self.assertIn("a: 1000 cycles", out.getvalue())
        self.assertIn("147.7x", out.getvalue())
        self.assertIn("beats 1363", out.getvalue())


if __name__ == "__main__":
    unittest.main()
