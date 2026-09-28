"""Score a solution with upstream's own correctness tests and cycle counter.

Usage: python3 score.py <pristine_checkout> <solution_dir>
Only the solution's kept files (run_config.json) are copied into the pristine
checkout. Prints one JSON object; everything upstream prints goes to stderr.
"""

import contextlib
import json
import pathlib
import shutil
import sys
import unittest

# reference/ stands for the unmodified upstream, which cannot be committed.
BASELINE_MARKER = "UPSTREAM_BASELINE"
# run.sh reads the same file to decide what reaches a run's output/.
RUN_CONFIG = json.loads((pathlib.Path(__file__).resolve().parent.parent / "run_config.json").read_text())
# Written by run.sh: the run's output/ holds only the candidate's files, so a
# change to a protected upstream path shows only in this list.
UPSTREAM_CHANGES = ".upstream_changes.json"


def tree_files(root: pathlib.Path) -> dict[str, bytes]:
    # Running the submission tests writes __pycache__, which is not an edit.
    return {
        path.relative_to(root).as_posix(): path.read_bytes()
        for path in root.rglob("*")
        if path.is_file() and "__pycache__" not in path.relative_to(root).parts
    }


def is_protected(rel: str) -> bool:
    return any(rel.startswith(p) if p.endswith("/") else rel == p for p in RUN_CONFIG["protected_paths"])


def tests_untouched(solution: pathlib.Path, checkout: pathlib.Path) -> bool:
    manifest = solution / UPSTREAM_CHANGES
    if manifest.is_file():
        changes = json.loads(manifest.read_text())
        if any(is_protected(rel) for kind in ("modified", "added", "deleted") for rel in changes[kind]):
            return False
    # A full-tree solution carries the protected paths themselves.
    for rel in RUN_CONFIG["protected_paths"]:
        if rel.endswith("/"):
            ours = solution / rel.rstrip("/")
            if ours.exists() and tree_files(ours) != tree_files(checkout / rel.rstrip("/")):
                return False
        else:
            ours = solution / rel
            if ours.exists() and ours.read_bytes() != (checkout / rel).read_bytes():
                return False
    return True


def run_upstream_checks(checkout: pathlib.Path) -> tuple[bool, dict]:
    sys.path.insert(0, str(checkout))
    sys.path.insert(0, str(checkout / "tests"))
    with contextlib.redirect_stdout(sys.stderr):
        import submission_tests

        suite = unittest.defaultTestLoader.loadTestsFromTestCase(submission_tests.CorrectnessTests)
        if not unittest.TextTestRunner(stream=sys.stderr).run(suite).wasSuccessful():
            return False, {}
        # Upstream's cycles() scores a wrong answer as twice the baseline; a
        # penalty is not a measurement, so a wrong answer gets no cycle count.
        try:
            return True, {"cycles": submission_tests.do_kernel_test(10, 16, 256)}
        except AssertionError:
            return False, {}


def main() -> None:
    checkout = pathlib.Path(sys.argv[1]).resolve()
    solution = pathlib.Path(sys.argv[2]).resolve()
    untouched = tests_untouched(solution, checkout)

    kept = [name for name in RUN_CONFIG["kept_files"] if (solution / name).is_file()]
    if kept:
        for name in kept:
            shutil.copyfile(solution / name, checkout / name)
        correct, metrics = run_upstream_checks(checkout)
    elif (solution / BASELINE_MARKER).is_file():
        correct, metrics = run_upstream_checks(checkout)
    else:
        print(f"score.py: {solution} has none of {RUN_CONFIG['kept_files']}", file=sys.stderr)
        correct, metrics = False, {}

    results = [
        {"id": "correct", "passed": correct},
        {"id": "tests-untouched", "passed": untouched},
    ]
    print(json.dumps({"results": results, "metrics": metrics}))


main()
