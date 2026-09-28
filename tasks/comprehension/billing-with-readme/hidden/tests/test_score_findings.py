"""Behaviour of the FINDINGS.md location matcher, against a small hand-written key."""

import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

HIDDEN = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HIDDEN))

from score_findings import score  # noqa: E402

KEY = {
    "file": "billing.ts",
    "bugs": [
        {"id": "alpha", "ranges": [[10, 12]]},
        {"id": "beta", "ranges": [[40, 44], [90, 90]]},
    ],
}


def located(text: str) -> dict[str, bool]:
    return {r["id"]: r["passed"] for r in score(text, KEY)["results"]}


class LocationFormsTest(unittest.TestCase):
    def test_line_word_with_number_locates_bug(self):
        self.assertEqual(located("- Line 11: wrong rounding"), {"alpha": True, "beta": False})

    def test_file_colon_line_locates_bug(self):
        self.assertEqual(located("1. `billing.ts:42` mutates state"), {"alpha": False, "beta": True})

    def test_l_prefixed_line_locates_bug(self):
        self.assertEqual(located("## L90 double counts"), {"alpha": False, "beta": True})

    def test_line_range_overlapping_bug_range_locates_bug(self):
        self.assertEqual(located("- lines 5-10: off by one"), {"alpha": True, "beta": False})

    def test_en_dash_range_locates_bug(self):
        self.assertEqual(located("- lines 44–46: off by one"), {"alpha": False, "beta": True})

    def test_listed_lines_each_count(self):
        self.assertEqual(located("- Lines 12 and 90: shared cause"), {"alpha": True, "beta": True})

    def test_bold_line_label_locates_bug(self):
        self.assertEqual(located("- **Line:** 41\n- **Why:** state"), {"alpha": False, "beta": True})

    def test_table_line_column_locates_bug(self):
        table = "| # | Line | Problem |\n|---|---|---|\n| 1 | 43 | mutates |\n"
        self.assertEqual(located(table), {"alpha": False, "beta": True})

    def test_bare_number_outside_line_reference_is_ignored(self):
        self.assertEqual(located("- It charges 11 cents too much"), {"alpha": False, "beta": False})

    def test_nearby_line_outside_range_does_not_locate(self):
        self.assertEqual(located("- Line 13: wrong"), {"alpha": False, "beta": False})

    def test_range_spanning_most_of_file_is_ignored(self):
        self.assertEqual(located("- lines 1-100: everything"), {"alpha": False, "beta": False})


class MetricsTest(unittest.TestCase):
    def test_findings_are_counted_per_list_item_or_heading(self):
        text = "# Findings\n\n1. Line 11: a\n2. Line 60: b\n\n## Line 90\nwhy\n"
        self.assertEqual(score(text, KEY)["metrics"]["findings"], 3)

    def test_finding_matching_no_bug_is_unmatched(self):
        text = "1. Line 11: a\n2. Line 60: b\n3. Line 70: c\n"
        self.assertEqual(score(text, KEY)["metrics"]["unmatched_findings"], 2)

    def test_bugs_located_counts_distinct_bugs(self):
        text = "1. Line 11: a\n2. Line 12: same bug again\n"
        self.assertEqual(score(text, KEY)["metrics"]["bugs_located"], 1)


class CommandLineTest(unittest.TestCase):
    def run_cli(self, solution_dir: pathlib.Path) -> dict:
        key_path = solution_dir / "key.json"
        key_path.write_text(json.dumps(KEY))
        proc = subprocess.run(
            [sys.executable, str(HIDDEN / "score_findings.py"), str(solution_dir), str(key_path)],
            capture_output=True,
            text=True,
            check=True,
        )
        return json.loads(proc.stdout)

    def test_missing_findings_file_fails_every_bug(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = self.run_cli(pathlib.Path(tmp))
        self.assertEqual(
            output,
            {
                "results": [{"id": "alpha", "passed": False}, {"id": "beta", "passed": False}],
                "metrics": {"findings_file": 0, "findings": 0, "unmatched_findings": 0, "bugs_located": 0},
            },
        )

    def test_findings_file_in_solution_dir_is_scored(self):
        with tempfile.TemporaryDirectory() as tmp:
            (pathlib.Path(tmp) / "FINDINGS.md").write_text("- Line 11: a\n")
            output = self.run_cli(pathlib.Path(tmp))
        self.assertEqual(
            output,
            {
                "results": [{"id": "alpha", "passed": True}, {"id": "beta", "passed": False}],
                "metrics": {"findings_file": 1, "findings": 1, "unmatched_findings": 0, "bugs_located": 1},
            },
        )


if __name__ == "__main__":
    unittest.main()
