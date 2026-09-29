"""Run one algorithm question's vitest suite against a candidate's solution.ts.

Usage: python3 run_suite.py <suite.test.ts> <solution_dir>

Prints {"results": [...], "metrics": {...}} with one result per top-level
describe block (a case group) plus "all-cases", which passes only when every
case in every group passes. Exits non-zero only when the checker itself
breaks, never because the solution is wrong, missing, or too slow.
"""

import json
import os
import pathlib
import shutil
import signal
import subprocess
import sys
import tempfile

VITEST = "vitest@5.0.0"
# A solution stuck in a synchronous loop blocks the vitest worker, so the
# per-case timeout never fires; this bounds the whole run instead.
RUN_TIMEOUT_S = 300


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: run_suite.py <suite.test.ts> <solution_dir>", file=sys.stderr)
        return 2
    suite = pathlib.Path(argv[0]).resolve()
    solution = pathlib.Path(argv[1]).resolve() / "solution.ts"

    with tempfile.TemporaryDirectory() as tmp:
        work = pathlib.Path(tmp)
        shutil.copy(suite, work / "suite.test.ts")
        # A missing solution.ts is a failing candidate, not a broken checker:
        # the suite imports it in beforeAll, so every case reports failed.
        if solution.is_file():
            shutil.copy(solution, work / "solution.ts")
        report = work / "report.json"
        log = work / "vitest.log"
        with log.open("w") as log_file:
            # Its own process group, so a timeout kills the vitest workers
            # too; killing only npx would leave them spinning.
            run = subprocess.Popen(
                npx("run", "--reporter=json", f"--outputFile={report}", "--testTimeout=60000"),
                cwd=work,
                stdout=log_file,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
            try:
                run.wait(timeout=RUN_TIMEOUT_S)
            except subprocess.TimeoutExpired:
                os.killpg(run.pid, signal.SIGKILL)
                run.wait()
                return print_timed_out(work)
        if not report.is_file():
            print(f"vitest wrote no report: {log.read_text().strip()[-500:]}", file=sys.stderr)
            return 1
        cases = cases_from_report(json.loads(report.read_text()))

    if not cases:
        print("vitest report holds no cases", file=sys.stderr)
        return 1
    print_results(cases, timed_out=False)
    return 0


def npx(*args: str) -> list[str]:
    return ["npx", "--yes", VITEST, *args, "--globals"]


def cases_from_report(report: dict) -> list[tuple[str, bool]]:
    return [
        (assertion["ancestorTitles"][0], assertion["status"] == "passed")
        for file_result in report["testResults"]
        for assertion in file_result["assertionResults"]
    ]


def print_timed_out(work: pathlib.Path) -> int:
    listing = subprocess.run(npx("list", "--json"), cwd=work, capture_output=True, text=True)
    if listing.returncode != 0:
        print(f"vitest list failed: {listing.stderr.strip()[-500:]}", file=sys.stderr)
        return 1
    cases = [(entry["name"].split(" > ")[0], False) for entry in json.loads(listing.stdout)]
    print_results(cases, timed_out=True)
    return 0


def print_results(cases: list[tuple[str, bool]], timed_out: bool) -> None:
    groups: dict[str, bool] = {}
    for group, passed in cases:
        groups[group] = groups.get(group, True) and passed
    results = [{"id": group, "passed": passed} for group, passed in groups.items()]
    results.append({"id": "all-cases", "passed": all(passed for _, passed in cases)})
    metrics = {
        "cases_total": len(cases),
        "cases_passed": sum(1 for _, passed in cases if passed),
        "timed_out": 1 if timed_out else 0,
    }
    print(json.dumps({"results": results, "metrics": metrics}))


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
