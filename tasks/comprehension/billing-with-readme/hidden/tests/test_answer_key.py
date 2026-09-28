"""The answer key's line ranges must match where the planted bugs actually are.

The only differences between the workspace module and the fixed module are
the planted bugs, so every differing line must fall in a bug's ranges and
every bug's ranges must contain a differing line.
"""

import difflib
import json
import pathlib
import unittest

TASK = pathlib.Path(__file__).resolve().parents[2]
PLANTED = TASK / "workspace" / "billing.ts"
FIXED = TASK / "hidden" / "bugs" / "billing.fixed.ts"
KEY = json.loads((TASK / "hidden" / "answer_key.json").read_text())


def changed_planted_lines() -> set[int]:
    planted = PLANTED.read_text().splitlines()
    fixed = FIXED.read_text().splitlines()
    changed = set()
    matcher = difflib.SequenceMatcher(a=planted, b=fixed, autojunk=False)
    for tag, i1, i2, _, _ in matcher.get_opcodes():
        if tag == "equal":
            continue
        # A pure insertion in the fix is located at the planted line it precedes.
        changed.update(range(i1 + 1, max(i2, i1 + 1) + 1))
    return changed


def in_ranges(line: int, ranges) -> bool:
    return any(lo <= line <= hi for lo, hi in ranges)


class AnswerKeyTest(unittest.TestCase):
    def test_every_changed_line_belongs_to_a_bug(self):
        stray = [
            line
            for line in sorted(changed_planted_lines())
            if not any(in_ranges(line, bug["ranges"]) for bug in KEY["bugs"])
        ]
        self.assertEqual(stray, [])

    def test_every_bug_covers_a_changed_line(self):
        changed = changed_planted_lines()
        uncovered = [
            bug["id"]
            for bug in KEY["bugs"]
            if not any(in_ranges(line, bug["ranges"]) for line in changed)
        ]
        self.assertEqual(uncovered, [])

    def test_bug_ranges_do_not_overlap(self):
        owner = {}
        clashes = []
        for bug in KEY["bugs"]:
            for lo, hi in bug["ranges"]:
                for line in range(lo, hi + 1):
                    if line in owner:
                        clashes.append((line, owner[line], bug["id"]))
                    owner[line] = bug["id"]
        self.assertEqual(clashes, [])

    def test_six_bugs_two_per_category(self):
        categories = sorted(bug["category"] for bug in KEY["bugs"])
        self.assertEqual(categories, ["rule", "rule", "trace", "trace", "visible", "visible"])


if __name__ == "__main__":
    unittest.main()
