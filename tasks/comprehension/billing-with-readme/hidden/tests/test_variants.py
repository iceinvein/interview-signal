"""The two comprehension variants must differ only in whether README.md is shown."""

import pathlib
import unittest

COMPREHENSION = pathlib.Path(__file__).resolve().parents[3]
WITH = COMPREHENSION / "billing-with-readme"
WITHOUT = COMPREHENSION / "billing-no-readme"


def files_under(root: pathlib.Path) -> set[str]:
    return {str(p.relative_to(root)) for p in root.rglob("*") if p.is_file()}


class VariantsTest(unittest.TestCase):
    def test_workspaces_differ_only_by_readme(self):
        self.assertEqual(files_under(WITH / "workspace") - files_under(WITHOUT / "workspace"), {"README.md"})

    def test_no_readme_workspace_holds_only_the_module(self):
        self.assertEqual(files_under(WITHOUT / "workspace"), {"billing.ts"})

    def test_module_is_identical(self):
        self.assertEqual(
            (WITH / "workspace" / "billing.ts").read_bytes(),
            (WITHOUT / "workspace" / "billing.ts").read_bytes(),
        )

    def test_rubric_is_identical(self):
        self.assertEqual((WITH / "rubric.json").read_bytes(), (WITHOUT / "rubric.json").read_bytes())

    def test_reference_findings_are_identical(self):
        self.assertEqual(
            (WITH / "reference" / "FINDINGS.md").read_bytes(),
            (WITHOUT / "reference" / "FINDINGS.md").read_bytes(),
        )

    def test_prompts_differ_only_by_the_readme_mention(self):
        with_readme = (WITH / "prompt.md").read_text()
        without = (WITHOUT / "prompt.md").read_text()
        self.assertEqual(with_readme.replace(" against the rules in `README.md`,", ""), without)


if __name__ == "__main__":
    unittest.main()
