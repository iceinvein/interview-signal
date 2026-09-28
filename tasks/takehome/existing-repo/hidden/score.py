"""Turn the vitest and tsc runs from run.sh into the task's result JSON.

score.py same-deps <workspace package.json> <solution package.json>
    exits 0 when the solution declares the same dependencies as the workspace
score.py score --app ... --typecheck-rc ... --suite ... --acceptance ...
    --acceptance-source ... --originals ...
    prints {"results": [...], "metrics": {...}}
"""

import argparse
import json
import pathlib
import re
import sys

DEP_KEYS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]
ACCEPTANCE_ID = re.compile(r'^\s*it\("([a-z0-9_]+):', re.MULTILINE)
THROW = re.compile(r"\bthrow\b")


def same_deps(workspace: pathlib.Path, solution: pathlib.Path) -> bool:
    try:
        candidate = json.loads(solution.read_text())
    except (OSError, json.JSONDecodeError):
        return False
    original = json.loads(workspace.read_text())
    return all(original.get(k) == candidate.get(k) for k in DEP_KEYS)


def load_report(path: pathlib.Path):
    """Vitest's JSON report, or None when vitest wrote nothing."""
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return None


def test_statuses(report, app: pathlib.Path) -> dict[str, str]:
    """Map 'relative/file.test.ts > describe > title' to vitest's status."""
    statuses = {}
    if report is None:
        return statuses
    for file_result in report.get("testResults", []):
        rel = pathlib.Path(file_result["name"]).resolve().relative_to(app.resolve()).as_posix()
        for assertion in file_result.get("assertionResults", []):
            key = " > ".join([rel, *assertion.get("ancestorTitles", []), assertion["title"]])
            statuses[key] = assertion["status"]
    return statuses


def acceptance_statuses(report) -> dict[str, bool]:
    passed = {}
    if report is None:
        return passed
    for file_result in report.get("testResults", []):
        for assertion in file_result.get("assertionResults", []):
            test_id = assertion["title"].split(":", 1)[0]
            passed[test_id] = assertion["status"] == "passed"
    return passed


def src_metrics(app: pathlib.Path) -> dict[str, int]:
    lines = throws = 0
    for path in (app / "src").rglob("*.ts"):
        text = path.read_text(errors="replace")
        lines += text.count("\n")
        throws += len(THROW.findall(text))
    return {"src_lines": lines, "src_throw_count": throws}


def score(args) -> dict:
    app = pathlib.Path(args.app)
    originals = [line for line in pathlib.Path(args.originals).read_text().splitlines() if line]
    acceptance_ids = ACCEPTANCE_ID.findall(pathlib.Path(args.acceptance_source).read_text())

    suite_report = load_report(pathlib.Path(args.suite))
    suite = test_statuses(suite_report, app)
    acceptance = acceptance_statuses(load_report(pathlib.Path(args.acceptance)))

    originals_passed = sum(1 for name in originals if suite.get(name) == "passed")
    suite_failed = sum(1 for status in suite.values() if status not in ("passed", "skipped", "todo"))
    suite_skipped = sum(1 for status in suite.values() if status in ("skipped", "todo"))
    added = [name for name in suite if name not in set(originals)]

    results = [
        {"id": "typecheck", "passed": args.typecheck_rc == 0},
        # `success` also covers test files that failed to load and so report no tests.
        {"id": "suite_passes", "passed": bool(suite) and suite_report.get("success") is True},
        {"id": "no_regressions", "passed": originals_passed == len(originals)},
    ]
    results += [{"id": test_id, "passed": acceptance.get(test_id, False)} for test_id in acceptance_ids]

    metrics = {
        "acceptance_passed": sum(1 for test_id in acceptance_ids if acceptance.get(test_id, False)),
        "acceptance_total": len(acceptance_ids),
        "original_tests_passed": originals_passed,
        "original_tests_total": len(originals),
        "suite_tests_total": len(suite),
        "suite_tests_failed": suite_failed,
        "suite_tests_skipped": suite_skipped,
        "tests_added": len(added),
        **src_metrics(app),
    }
    return {"results": results, "metrics": metrics}


def main(argv: list[str]) -> int:
    if argv[:1] == ["same-deps"] and len(argv) == 3:
        return 0 if same_deps(pathlib.Path(argv[1]), pathlib.Path(argv[2])) else 1
    if argv[:1] != ["score"]:
        print(__doc__, file=sys.stderr)
        return 2
    parser = argparse.ArgumentParser()
    parser.add_argument("--app", required=True)
    parser.add_argument("--typecheck-rc", type=int, required=True)
    parser.add_argument("--suite", required=True)
    parser.add_argument("--acceptance", required=True)
    parser.add_argument("--acceptance-source", required=True)
    parser.add_argument("--originals", required=True)
    print(json.dumps(score(parser.parse_args(argv[1:]))))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
