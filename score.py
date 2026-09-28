"""Score finished runs with each task's hidden checker.

Usage: python3 score.py [--rescore]

Every runs/*/ holding a result.json is scored by running the task's
hidden/run.sh on its output/ and mapping the rubric's auto criteria onto the
checker's results. Each score lands in <run>/score.json and the checker's
stderr in <run>/score_stderr.txt. A run that already has score.json is left
alone unless --rescore is given. RUNS_DIR and TASKS_DIR override where runs
and tasks are read from, as they do for run.sh.
"""

import argparse
import collections
import concurrent.futures
import json
import os
import pathlib
import signal
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parent
TASKS_DIR = pathlib.Path(os.environ.get("TASKS_DIR", REPO / "tasks"))
RUNS_DIR = pathlib.Path(os.environ.get("RUNS_DIR", REPO / "runs"))
CHECKER_TIMEOUT_S = 600
WORKERS = 4


class ScoringError(Exception):
    pass


def score_run(run_dir: pathlib.Path, tasks_dir: pathlib.Path = TASKS_DIR) -> dict:
    """Run the task's checker on run_dir/output, write run_dir/score.json and return it."""
    # A score that fails to refresh must not leave the old one standing.
    (run_dir / "score.json").unlink(missing_ok=True)
    run = json.loads((run_dir / "result.json").read_text())
    task_dir = tasks_dir / run["format"] / run["task"]
    rubric = json.loads((task_dir / "rubric.json").read_text())
    checked = run_checker(task_dir, run_dir)

    passed_by_id = {r["id"]: r["passed"] for r in checked["results"]}
    auto_criteria = []
    for criterion in rubric["criteria"]:
        if criterion["kind"] != "auto":
            continue
        if criterion["test_id"] not in passed_by_id:
            raise ScoringError(
                f"{run_dir.name}: criterion {criterion['id']} maps to result "
                f"{criterion['test_id']!r}, which the checker did not report"
            )
        auto_criteria.append({"id": criterion["id"], "passed": passed_by_id[criterion["test_id"]]})

    scored = {
        "format": run["format"],
        "task": run["task"],
        "agent": run["agent"],
        "rep": run["rep"],
        "results": checked["results"],
        "metrics": checked["metrics"],
        "auto_criteria": auto_criteria,
    }
    tmp = run_dir / "score.json.tmp"
    tmp.write_text(json.dumps(scored, indent=2) + "\n")
    os.replace(tmp, run_dir / "score.json")
    return scored


def run_checker(task_dir: pathlib.Path, run_dir: pathlib.Path) -> dict:
    """Run hidden/run.sh on the run's output and return its parsed JSON."""
    run_sh = task_dir / "hidden" / "run.sh"
    env = dict(os.environ, TZ="UTC")
    with open(run_dir / "score_stderr.txt", "w") as stderr:
        # Its own session, so a timeout can stop the npm and vitest children too.
        proc = subprocess.Popen(
            [str(run_sh), str((run_dir / "output").resolve())],
            cwd=task_dir, env=env, stdout=subprocess.PIPE, stderr=stderr, text=True,
            start_new_session=True,
        )
        try:
            stdout, _ = proc.communicate(timeout=CHECKER_TIMEOUT_S)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            proc.communicate()
            raise ScoringError(f"{run_dir.name}: checker ran past {CHECKER_TIMEOUT_S} s") from None

    if proc.returncode != 0:
        raise ScoringError(f"{run_dir.name}: checker exited {proc.returncode}; see score_stderr.txt")
    try:
        checked = json.loads(stdout)
    except json.JSONDecodeError:
        raise ScoringError(f"{run_dir.name}: checker did not print JSON: {stdout[:200]!r}") from None
    if not isinstance(checked, dict) or not isinstance(checked.get("results"), list) \
            or not isinstance(checked.get("metrics"), dict):
        raise ScoringError(f"{run_dir.name}: checker output lacks results or metrics: {stdout[:200]!r}")
    return checked


def summarise(scores: list[dict]) -> str:
    """Per format, how many runs each agent passed for each auto criterion."""
    counts = collections.defaultdict(lambda: [0, 0])
    for s in scores:
        for c in s["auto_criteria"]:
            tally = counts[(s["format"], s["agent"], c["id"])]
            tally[0] += c["passed"]
            tally[1] += 1

    lines = []
    for fmt in sorted({s["format"] for s in scores}):
        lines.append(f"== {fmt}")
        for agent in sorted({s["agent"] for s in scores if s["format"] == fmt}):
            runs = sum(1 for s in scores if s["format"] == fmt and s["agent"] == agent)
            lines.append(f"  {agent} ({runs} runs)")
            for (f, a, criterion), (passed, total) in sorted(counts.items()):
                if f == fmt and a == agent:
                    lines.append(f"    {criterion:<40} {passed}/{total}")
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Score finished runs with their hidden checkers.")
    parser.add_argument("--rescore", action="store_true", help="score runs that already have score.json")
    args = parser.parse_args(argv)

    runs = sorted(p.parent for p in RUNS_DIR.glob("*/result.json"))
    to_score = [r for r in runs if args.rescore or not (r / "score.json").is_file()]
    failures = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(score_run, run): run for run in to_score}
        for future in concurrent.futures.as_completed(futures):
            try:
                future.result()
                print(f"scored {futures[future].name}", file=sys.stderr)
            except ScoringError as e:
                failures.append(str(e))

    scores = [json.loads((r / "score.json").read_text()) for r in runs if (r / "score.json").is_file()]
    print(summarise(scores))
    for failure in failures:
        print(f"failed {failure}", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
