"""Run with: python3 -m unittest discover tasks/takehome/existing-repo/hidden/tests"""

import json
import pathlib
import subprocess
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor

TASK = pathlib.Path(__file__).resolve().parents[2]
RUN_SH = TASK / "hidden" / "run.sh"


class ParallelRunsOnEmptyCache(unittest.TestCase):
    def test_four_parallel_reference_runs_all_score_full_marks(self):
        with tempfile.TemporaryDirectory() as cache_root:
            env = {**__import__("os").environ, "EXISTING_REPO_DEPS_CACHE": cache_root}

            def run(_):
                return subprocess.run(
                    [str(RUN_SH), str(TASK / "reference")], capture_output=True, text=True, env=env
                )

            with ThreadPoolExecutor(max_workers=4) as pool:
                procs = list(pool.map(run, range(4)))

            for proc in procs:
                self.assertEqual(proc.returncode, 0, proc.stderr[-2000:])
                results = json.loads(proc.stdout)["results"]
                self.assertEqual(len(results), 17)
                self.assertEqual([r["id"] for r in results if not r["passed"]], [])
            leftovers = [p.name for p in pathlib.Path(cache_root).iterdir() if p.name.startswith(".build")]
            self.assertEqual(leftovers, [])


if __name__ == "__main__":
    unittest.main()
