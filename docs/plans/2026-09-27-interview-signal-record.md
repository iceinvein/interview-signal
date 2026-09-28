# Run record: interview-signal

## Pre-flight (2026-09-28)

- **Review: tier 3 only.** Six reviewer dispatches: Tasks 2 to 5 (their rubrics,
  traps and answer keys define what the post measures, and a wrong one
  silently corrupts every run scored against it), Task 8 (every later task
  builds on the run directory shape) and Task 11 (the flip). The other eight
  get a commit stat read and are covered by the final review. Operator chose
  the recommended option.
- **Effort: all at session effort.** No task is mechanical: each turns on
  rubric, trap or harness judgment. Operator chose the recommended option.
- **Workspace: a worktree per implementer, agents commit their own task.**
  After Task 1, Tasks 2 to 10 have disjoint Touches and no edges between
  them, so up to nine can run at once. This repo is not the session's primary
  repo, so the harness worktree tool cannot cut them; worktrees are cut with
  `git worktree add` under `../interview-signal-wt/<task>` and each
  implementer is pointed at its own absolute path. The controller merges each
  branch into main. Task 1 runs on main alone, before any worktree exists.

## Decisions

- Design sign-off answers are recorded in the design doc: Haiku 4.5 in
  algorithms only; perf caps 2 h and $25 per run; Claude does the 20%
  hand-check; Claude authors A2 and A3.
