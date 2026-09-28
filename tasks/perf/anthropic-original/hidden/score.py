"""Run upstream's own correctness tests and cycle counter on a prepared checkout.

Usage: python3 score.py <upstream_checkout>
Prints one JSON object; everything upstream prints goes to stderr.
"""

import contextlib
import json
import pathlib
import sys
import unittest

checkout = pathlib.Path(sys.argv[1]).resolve()
sys.path.insert(0, str(checkout))
sys.path.insert(0, str(checkout / "tests"))

with contextlib.redirect_stdout(sys.stderr):
    import submission_tests

    suite = unittest.defaultTestLoader.loadTestsFromTestCase(submission_tests.CorrectnessTests)
    correct = unittest.TextTestRunner(stream=sys.stderr).run(suite).wasSuccessful()
    metrics = {}
    if correct:
        # Upstream's cycles() scores a wrong answer as twice the baseline; a
        # penalty is not a measurement, so a wrong answer gets no cycle count.
        try:
            metrics["cycles"] = submission_tests.do_kernel_test(10, 16, 256)
        except AssertionError:
            correct = False

print(json.dumps({"results": [{"id": "correct", "passed": correct}], "metrics": metrics}))
