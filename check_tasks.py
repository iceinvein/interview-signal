"""Validate interview tasks before any paid run.

Usage: python3 check_tasks.py [<format>/<id> ...]
With no arguments every task under tasks/ is checked.
"""

import json
import pathlib
import re
import subprocess
import sys

TASKS_ROOT = pathlib.Path(__file__).resolve().parent / "tasks"
FORMATS = {"takehome", "comprehension", "algorithms", "perf"}
LAYOUT_FILES = ["meta.json", "prompt.md", "hidden/run.sh", "rubric.json"]
LAYOUT_DIRS = ["workspace", "reference"]
FORBIDDEN_PROMPT_WORDS = re.compile(r"\b(rubric|trap|planted|hidden)\b", re.IGNORECASE)
# The perf task's reference is the unmodified upstream baseline, which the
# workspace also is, so the workspace-must-fail rule cannot hold for it.
WORKSPACE_WAIVER_VARIANT = "baseline-passes"


def check(task_dir: pathlib.Path) -> list[str]:
    task_dir = task_dir.resolve()
    if not task_dir.is_dir():
        return [f"task directory {task_dir} does not exist"]

    problems = []
    for name in LAYOUT_FILES:
        if not (task_dir / name).is_file():
            problems.append(f"missing {name}")
    for name in LAYOUT_DIRS:
        if not (task_dir / name).is_dir():
            problems.append(f"missing {name}/")
    if problems:
        return problems
    run_sh = task_dir / "hidden" / "run.sh"
    if not run_sh.stat().st_mode & 0o111:
        return ["hidden/run.sh is not executable"]

    meta = load_json(task_dir / "meta.json", problems)
    if meta is not None:
        problems += meta_problems(meta)
    rubric = load_json(task_dir / "rubric.json", problems)
    if rubric is not None:
        problems += rubric_problems(rubric)
    problems += prompt_problems((task_dir / "prompt.md").read_text())

    reference = run_hidden(run_sh, task_dir / "reference", problems)
    if reference is not None:
        if not reference:
            problems.append("hidden/run.sh reference produced no results")
        failed = [r["id"] for r in reference if not r["passed"]]
        if failed:
            problems.append(f"hidden/run.sh reference fails: {', '.join(failed)}")
        if rubric is not None and isinstance(rubric.get("criteria"), list):
            result_ids = {r["id"] for r in reference}
            for criterion in rubric["criteria"]:
                if not isinstance(criterion, dict) or criterion.get("kind") != "auto":
                    continue
                test_id = criterion.get("test_id")
                if isinstance(test_id, str) and test_id not in result_ids:
                    problems.append(
                        f"rubric criterion {criterion.get('id')!r} names test_id "
                        f"{test_id!r}, which hidden/run.sh reference does not report"
                    )

    waived = isinstance(meta, dict) and meta.get("variant") == WORKSPACE_WAIVER_VARIANT
    if not waived:
        workspace = run_hidden(run_sh, task_dir / "workspace", problems)
        if workspace is not None and all(r["passed"] for r in workspace):
            problems.append("hidden/run.sh workspace fails no result; it must fail at least one")
    return problems


def load_json(path: pathlib.Path, problems: list[str]):
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError as err:
        problems.append(f"{path.name} is not valid JSON: {err}")
        return None


def meta_problems(meta) -> list[str]:
    if not isinstance(meta, dict):
        return ["meta.json is not an object"]
    problems = []
    for key in ["id", "title", "source", "license"]:
        if not isinstance(meta.get(key), str):
            problems.append(f"meta.json {key} must be a string")
    if meta.get("format") not in FORMATS:
        problems.append(f"meta.json format must be one of {sorted(FORMATS)}, got {meta.get('format')!r}")
    if "variant" not in meta or not (meta["variant"] is None or isinstance(meta["variant"], str)):
        problems.append("meta.json variant must be a string or null")
    return problems


def rubric_problems(rubric) -> list[str]:
    if not isinstance(rubric, dict):
        return ["rubric.json is not an object"]
    problems = []
    criteria = rubric.get("criteria")
    if not isinstance(criteria, list) or not criteria:
        problems.append("rubric.json criteria must be a non-empty list")
        criteria = []
    seen = set()
    for index, criterion in enumerate(criteria):
        if not isinstance(criterion, dict):
            problems.append(f"rubric.json criterion {index} is not an object")
            continue
        label = criterion.get("id", index)
        if not isinstance(criterion.get("id"), str):
            problems.append(f"rubric.json criterion {index} id must be a string")
        elif criterion["id"] in seen:
            problems.append(f"rubric.json criterion id {label!r} is duplicated")
        seen.add(criterion.get("id"))
        if not isinstance(criterion.get("text"), str):
            problems.append(f"rubric.json criterion {label!r} text must be a string")
        kind = criterion.get("kind")
        if kind not in ("auto", "judge"):
            problems.append(f"rubric.json criterion {label!r} kind must be auto or judge, got {kind!r}")
        test_id = criterion.get("test_id", "absent")
        if kind == "auto" and not isinstance(test_id, str):
            problems.append(f"rubric.json auto criterion {label!r} must name a test_id")
        elif not (test_id is None or isinstance(test_id, str)):
            problems.append(f"rubric.json criterion {label!r} test_id must be a string or null")
    if "trap" not in rubric:
        problems.append("rubric.json trap is missing (use null for no trap)")
    else:
        trap = rubric["trap"]
        if trap is not None and not (
            isinstance(trap, dict) and isinstance(trap.get("id"), str) and isinstance(trap.get("text"), str)
        ):
            problems.append("rubric.json trap must be null or an object with string id and text")
    return problems


def prompt_problems(prompt: str) -> list[str]:
    words = sorted({m.lower() for m in FORBIDDEN_PROMPT_WORDS.findall(prompt)})
    return [f"prompt.md mentions {word!r}" for word in words]


def run_hidden(run_sh: pathlib.Path, solution_dir: pathlib.Path, problems: list[str]):
    """Run the hidden checks; return the results list, or None if the checker broke."""
    label = f"hidden/run.sh {solution_dir.name}"
    proc = subprocess.run(
        [str(run_sh), str(solution_dir)],
        capture_output=True,
        text=True,
        cwd=run_sh.parent.parent,
    )
    if proc.returncode != 0:
        problems.append(f"{label} exited {proc.returncode}: {proc.stderr.strip()[-500:]}")
        return None
    try:
        output = json.loads(proc.stdout)
    except json.JSONDecodeError:
        problems.append(f"{label} did not print one JSON object: {proc.stdout.strip()[:200]!r}")
        return None

    shape_problems = []
    results = output.get("results") if isinstance(output, dict) else None
    if not isinstance(results, list) or not all(
        isinstance(r, dict) and isinstance(r.get("id"), str) and isinstance(r.get("passed"), bool)
        for r in results
    ):
        shape_problems.append(f"{label} results must be a list of {{id: str, passed: bool}}")
    else:
        ids = [r["id"] for r in results]
        duplicated = sorted({i for i in ids if ids.count(i) > 1})
        if duplicated:
            shape_problems.append(f"{label} repeats result ids: {', '.join(duplicated)}")
    metrics = output.get("metrics") if isinstance(output, dict) else None
    if not isinstance(metrics, dict) or not all(
        isinstance(v, (int, float)) and not isinstance(v, bool) for v in metrics.values()
    ):
        shape_problems.append(f"{label} metrics must be an object of numbers")
    if shape_problems:
        problems += shape_problems
        return None
    return results


def main(argv: list[str]) -> int:
    if argv:
        names = argv
    else:
        names = sorted(
            f"{d.parent.name}/{d.name}" for d in TASKS_ROOT.glob("*/*") if d.is_dir()
        )
        if not names:
            print(f"no tasks under {TASKS_ROOT}", file=sys.stderr)
            return 1
    all_ok = True
    for name in names:
        problems = check(TASKS_ROOT / name)
        if problems:
            all_ok = False
            print(f"FAIL {name}")
            for problem in problems:
                print(f"  {problem}")
        else:
            print(f"ok  {name}")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
