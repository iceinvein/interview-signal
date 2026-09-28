"""Score a solution with upstream's own correctness tests and cycle counter.

Usage: python3 score.py <pristine_checkout> <solution_dir>
Only the solution's perf_takehome.py is copied into the pristine checkout.
Prints one JSON object; everything upstream prints goes to stderr.
"""

import contextlib
import json
import pathlib
import shutil
import sys
import unittest

# reference/ stands for the unmodified upstream, which cannot be committed.
BASELINE_MARKER = "UPSTREAM_BASELINE"


def tree_files(root: pathlib.Path) -> dict[str, bytes]:
    # Running the submission tests writes __pycache__, which is not an edit.
    return {
        path.relative_to(root).as_posix(): path.read_bytes()
        for path in root.rglob("*")
        if path.is_file() and "__pycache__" not in path.relative_to(root).parts
    }


def tests_untouched(solution: pathlib.Path, checkout: pathlib.Path) -> bool:
    tests = solution / "tests"
    if tests.exists() and tree_files(tests) != tree_files(checkout / "tests"):
        return False
    problem = solution / "problem.py"
    if problem.exists() and problem.read_bytes() != (checkout / "problem.py").read_bytes():
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

    kernel = solution / "perf_takehome.py"
    if kernel.is_file():
        shutil.copyfile(kernel, checkout / "perf_takehome.py")
        correct, metrics = run_upstream_checks(checkout)
    elif (solution / BASELINE_MARKER).is_file():
        correct, metrics = run_upstream_checks(checkout)
    else:
        print(f"score.py: {solution} has no perf_takehome.py", file=sys.stderr)
        correct, metrics = False, {}

    results = [
        {"id": "correct", "passed": correct},
        {"id": "tests-untouched", "passed": untouched},
    ]
    print(json.dumps({"results": results, "metrics": metrics}))


main()
