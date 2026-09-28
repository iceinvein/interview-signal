"""Run with: python3 -m unittest discover tasks/takehome/existing-repo/hidden/tests"""

import json
import pathlib
import sys
import tempfile
import unittest
from types import SimpleNamespace

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import score  # noqa: E402

ACCEPTANCE_SOURCE = 'it("alpha_case: does a thing", () => {});\n'


def report(app: pathlib.Path, files: dict[str, list[tuple[str, str]]]) -> dict:
    return {
        "success": all(status == "passed" for tests in files.values() for _, status in tests),
        "testResults": [
            {
                "name": name if name.startswith("/") else str(app / name),
                "assertionResults": [
                    {"ancestorTitles": ["group"], "title": title, "status": status} for title, status in tests
                ],
            }
            for name, tests in files.items()
        ],
    }


class ScoreTest(unittest.TestCase):
    def setUp(self):
        self.dir = pathlib.Path(tempfile.mkdtemp())
        self.app = self.dir / "app"
        (self.app / "src").mkdir(parents=True)
        (self.dir / "originals.txt").write_text("test/a.test.ts > group > one\ntest/a.test.ts > group > two\n")
        (self.dir / "acceptance.test.ts").write_text(ACCEPTANCE_SOURCE)

    def score(self, suite: dict) -> dict:
        (self.dir / "suite.json").write_text(json.dumps(suite))
        args = SimpleNamespace(
            app=str(self.app),
            typecheck_rc=0,
            suite=str(self.dir / "suite.json"),
            acceptance=str(self.dir / "missing.json"),
            acceptance_source=str(self.dir / "acceptance.test.ts"),
            originals=str(self.dir / "originals.txt"),
        )
        return score.score(args)

    def test_counts_missing_and_failed_original_tests_separately(self):
        result = self.score(report(self.app, {"test/a.test.ts": [("one", "failed")]}))
        self.assertEqual(result["metrics"]["original_tests_missing"], 1)
        self.assertEqual(result["metrics"]["original_tests_failed"], 1)

    def test_test_file_outside_the_app_counts_as_missing_rather_than_crashing(self):
        suite = report(self.app, {"test/a.test.ts": [("one", "passed")], "/elsewhere/b.test.ts": [("x", "passed")]})
        result = self.score(suite)
        self.assertEqual(result["metrics"]["original_tests_missing"], 1)
        self.assertEqual(result["metrics"]["suite_tests_total"], 1)


if __name__ == "__main__":
    unittest.main()
