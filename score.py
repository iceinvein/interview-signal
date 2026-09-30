"""Score finished runs with each task's hidden checker.

Usage: python3 score.py [--rescore]

Every runs/*/ holding a result.json is scored by running the task's
hidden/run.sh on its output/ and mapping the rubric's auto criteria onto the
checker's results. Each score lands in <run>/score.json and the checker's
stderr in <run>/score_stderr.txt. A run that already has score.json is left
alone unless --rescore is given. RUNS_DIR and TASKS_DIR override where runs
and tasks are read from, as they do for run.sh.

The checker runs code the agent wrote, so it runs where the agent did: in a
fresh container of run.sh's agent image, as the user candidate, on the runs
network (which reaches the internet but not the Mac or Docker's VM), seeing
only a copy of the output's regular files at /solution and the task's
format directory at /tasks/<format>, both read-only. Before its first
checker, the process runs run.sh --check-isolation, the checks every agent
run makes.
SCRATCH_DIR is where the copies are made, as for run.sh.
"""

import argparse
import collections
import concurrent.futures
import json
import os
import pathlib
import shutil
import stat
import subprocess
import sys
import tempfile
import threading

REPO = pathlib.Path(__file__).resolve().parent
TASKS_DIR = pathlib.Path(os.environ.get("TASKS_DIR", REPO / "tasks"))
RUNS_DIR = pathlib.Path(os.environ.get("RUNS_DIR", REPO / "runs"))
# A copy of the output goes where Docker's VM can mount it; see run.sh.
SCRATCH_DIR = pathlib.Path(os.environ.get("SCRATCH_DIR", pathlib.Path.home() / ".cache" / "interview-signal" / "scratch"))
CHECKER_TIMEOUT_S = 600
WORKERS = 4
# The same image, network and limits as agent runs (run.sh).
IMAGE = "interview-signal-agent"
RUN_NETWORK = "interview-signal-runs"
MEMORY = os.environ.get("AGENT_MEMORY", "4g")
CPUS = os.environ.get("AGENT_CPUS", "2")
ISOLATION_CHECK = [str(REPO / "run.sh"), "--check-isolation"]
# The check's outcome, made once per process: None until it has run, then ""
# when it passed or the reason it failed.
_isolation_error = None
_isolation_lock = threading.Lock()


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


def copy_regular_files(source: pathlib.Path, dest: pathlib.Path) -> None:
    """Copies directories and regular files only: a symlink the agent left
    could point at any of the operator's files, and a FIFO would block."""
    dest.mkdir()
    for dirpath, dirnames, filenames in os.walk(source):
        rel = pathlib.Path(dirpath).relative_to(source)
        dirnames[:] = [d for d in dirnames if not os.path.islink(os.path.join(dirpath, d))]
        for d in dirnames:
            (dest / rel / d).mkdir()
        for name in filenames:
            path = pathlib.Path(dirpath) / name
            if stat.S_ISREG(path.lstat().st_mode):
                shutil.copy2(path, dest / rel / name, follow_symlinks=False)


def check_mounts(mounts: list[str], probes: list[str], what: str) -> None:
    """A path Docker's VM does not share mounts as an empty directory, which
    would score every run as failing without saying why."""
    command = ["docker", "run", "--rm", "--network", "none"]
    for mount in mounts:
        command += ["-v", mount]
    expression = []
    for probe in probes:
        if expression:
            expression.append("-a")
        expression += ["-e", probe]
    proc = subprocess.run(command + [IMAGE, "test", *expression], capture_output=True, text=True)
    if proc.returncode != 0:
        raise ScoringError(f"a container cannot see {what} (Docker's VM does not share it, or the image is missing): "
                           f"{proc.stderr.strip()[-300:]}")


def check_isolation() -> None:
    """Raises unless run.sh's isolation check has passed in this process."""
    global _isolation_error
    with _isolation_lock:
        if _isolation_error is None:
            proc = subprocess.run(ISOLATION_CHECK, capture_output=True, text=True)
            _isolation_error = "" if proc.returncode == 0 else proc.stderr.strip()[-500:]
    if _isolation_error:
        raise ScoringError(f"isolation check failed, so no checker runs: {_isolation_error}")


def kill_container(name: str) -> None:
    """Ends a container; one that has already exited (and been removed by
    --rm) is fine, but one docker could not kill is an error."""
    proc = subprocess.run(["docker", "kill", name], capture_output=True, text=True)
    if proc.returncode == 0:
        return
    running = subprocess.run(["docker", "ps", "--all", "--quiet", "--filter", f"name=^{name}$"],
                             capture_output=True, text=True, check=True).stdout
    if running.strip():
        raise ScoringError(f"docker kill {name} failed and the container is still there: {proc.stderr.strip()}")


def run_checker(task_dir: pathlib.Path, run_dir: pathlib.Path) -> dict:
    """Run hidden/run.sh on the run's output in a container and return its parsed JSON."""
    check_isolation()
    fmt, task = task_dir.parent.name, task_dir.name
    container_task = f"/tasks/{fmt}/{task}"
    SCRATCH_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    scratch = pathlib.Path(tempfile.mkdtemp(prefix="score.", dir=SCRATCH_DIR))
    name = f"interview-signal-{scratch.name}"
    try:
        solution = scratch / "solution"
        copy_regular_files(run_dir / "output", solution)
        # The marker sits beside the solution, not in it: a change to the
        # mounted tree just before the checker starts can reach the container
        # late, and tar then fails with "file changed as we read it".
        (scratch / "mount-check").mkdir()
        (scratch / "mount-check" / "marker").touch()
        mounts = [f"{solution}:/solution:ro", f"{task_dir.parent.resolve()}:/tasks/{fmt}:ro"]
        check_mounts([f"{scratch / 'mount-check'}:/mount-check:ro", mounts[1]],
                     ["/mount-check/marker", f"{container_task}/hidden/run.sh"], f"{scratch} or {task_dir}")
        command = ["docker", "run", "--rm", "--init", "--name", name, "--user", "candidate",
                   "--workdir", container_task, "--memory", MEMORY, "--cpus", CPUS,
                   "--network", RUN_NETWORK, "--security-opt", "no-new-privileges",
                   "-e", "TZ=UTC"]
        for mount in mounts:
            command += ["-v", mount]
        command += [IMAGE, f"{container_task}/hidden/run.sh", "/solution"]
        with open(run_dir / "score_stderr.txt", "w") as stderr:
            proc = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=stderr,
                                    text=True)
            try:
                stdout, _ = proc.communicate(timeout=CHECKER_TIMEOUT_S)
            except subprocess.TimeoutExpired:
                # Killing the client would leave the container running; this
                # ends it and everything the checker started inside.
                kill_container(name)
                proc.communicate()
                raise ScoringError(f"{run_dir.name}: checker ran past {CHECKER_TIMEOUT_S} s") from None
    finally:
        shutil.rmtree(scratch)

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
