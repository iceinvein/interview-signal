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

## Task notes

- **T1 (ef6636d)**, tier 1, stat read only per pre-flight. Implemented the
  `variant: "baseline-passes"` waiver that Task 7 depends on, since Task 7
  cannot touch `check_tasks.py`; recorded here as a finding owned by Task 7.
  The `prompt.md` banned-word check matches whole words, so an algorithm
  prompt that legitimately says "trap" (Trapping Rain Water) fails: Task 6's
  brief tells it to word around that rather than loosen the rule.
- **T7 (c29dbce, first pass)**: prompt taken from the `# Task` docstring in
  `perf_takehome.py` because the upstream README has no candidate-facing
  statement. Its added trap (agent editing `tests/`) is a cheat check, not a
  questionable requirement, so it was sent back to become an `auto`
  criterion `tests-untouched` with `trap: null`. Two findings owned by T8,
  passed to its implementer while in flight: macOS has no `timeout`, and a
  perf run's workspace holds the unlicensed upstream tree, so `output/`
  keeps only the candidate's files and never `.git`.
- **T8 (1105421, efa11f9)**: probe clean for all four agents. Probe spend
  $0.12 against a $0.10 cap (the implementer sourced probe.sh by mistake and
  ran it twice); logged, not repeated. Decisions taken by the controller:
  pin Codex to the operator's configured model and reasoning effort in the
  scratch `config.toml` so Codex runs reflect a real user's setup rather
  than the CLI fallback; Codex has no dollar cap, only the wall clock, which
  the post states. The probe proves the operator's instruction files are
  not loaded, not that an agent cannot read them off disk, so Task 12 scans
  every transcript for access to `~/.claude/` or `~/.codex/` and reports it.
- **T5 review round 1 (f8a960e)**: blocking: a citation could credit several
  bugs (a one-line list of six line numbers scored 6/6) and "not a bug"
  mentions got credit; the downgrade-timing comment contradicted its code, so
  a "README-only" bug was findable from the comment. Should-fix: table
  header and "line ~N" coverage, wide citations silently dropped, the
  tax-before-discount rule guessable from convention (replace with an
  arbitrary rule), no judge guidance on debatable non-bugs. All sent back.
- **T2 (ff3f7c0)**: the brief fixes no CLI, so scoring replays the event
  log the candidate's own run writes; undemonstrated requirements count as
  failed. Sent to review with emphasis on over-strictness, since this is the
  real-world control.
- **T4 review round 1 (67da8db)**: blocking: the shared dependency cache
  races under parallel scoring (silent 0/17 on the reference, permanently
  empty cache); the `summary_accurate` criterion needs the agent's final
  message, which lived only in the gitignored transcript. Should-fix: list
  shape tied to the trap response, start-instant boundary, regression
  metrics. Sent back.
- **Plan change (additive), decided by the controller**: every run
  directory gains a committed `final_message.txt` holding the agent's final
  message. Found by the T4 review (a cross-task finding owned by T8); it
  also serves the chat-versus-artefact analysis the mutgap post relied on.
  Nothing already built reads the run directory yet, so no Offers are
  invalidated. T8 applies it with its review fixes; T10's brief includes it.
- **T2 review round 1 (ff3f7c0)**: the checker rejects every planted fault
  but under-scores valid solutions: 5 of 7 hand-written valid logs scored 0
  on r1-r6 because the parser only knows the upstream sample's wording.
  Sent back: broaden parsing with the reviewer's logs as fixtures; add a
  `log_unparsed` gate so unparseable runs are excluded from auto pass rates
  and hand-graded (Task 12) rather than failed; score requirements as "not
  violated" plus one `demonstrates_all` criterion, because the backend brief
  never requires the run to demonstrate every requirement; content-hash r7.
- **T5 review round 2 (a4a6457)**: round-1 findings fixed; the new
  credit-before-tax rule is confirmed not inferable without the README, and
  each of the six bugs replanted alone fails exactly its own test. New:
  line 261 moved into the rule bug's range (inflates the no-readme score);
  the summary cap counted ranges rather than bugs, zeroing thorough traces;
  skip phrases discarded hedged real findings. Round 3 of 3 sent back.
- **T5 cleared at review round 3 (c05a718), merged.** Condition carried to
  Tasks 12 and 14: the comprehension headline numbers are the judged
  `*-explained` criteria; the auto `located` results are a necessary
  condition only. Known scorer limits accepted: sections titled
  "Observations (not bugs)" or a bold "**Not bugs:**" label are not
  recognised as non-bug sections; pipeless tables and bare "(182)"
  citations are missed; a whole-function buildInvoice citation can credit
  the rule bug. The judge criteria are what the post quotes, so these only
  affect `located`.
- **T4 cleared at review round 2 (f185b98), merged.** 32 parallel runs on
  an empty cache all scored 17/17; broken-cache paths now exit non-zero.
  Carried to Task 12/14: quote rubric criteria, not `acceptance_passed`,
  which includes 9 unmapped results. `summary_accurate` depends on the
  runner writing `final_message.txt` (T8 follow-up).
- **T2 review round 2 (efa62f0)**: round-1 findings fixed, but valid logs
  in new phrasings still misjudged without tripping the gate, and scoring
  "not violated" let a truncated or never-processing log pass r1-r6.
  Controller decision (criterion change, confined to the FeedMe task and to
  Task 12): a regex parser over free-form logs will never be complete, so
  every FeedMe run (15) is hand-graded in Task 12 with the parser as first
  pass, rather than a 20% sample; the post quotes the hand-checked numbers,
  with rN rates over runs where the requirement was exercised and the log
  parsed. Round 3 of 3 sent back with the reviewer's concrete fixes, aimed at
  never accepting a wrong run and flagging what the parser cannot read.
- **T3 review round 1 (467acab)**: 24 variant solutions tested. Blocking:
  chunked forwarding, a per-destination connection cap (all tenants shared
  one fake destination port) and binding `localhost` (IPv6 on macOS) were
  rejected although valid; the trap metric missed Buffer-JSON and base64
  logging and fired on dead-letter storage. Controller decision: drop
  "rolling" from the rate-limit wording rather than add a timing probe, since
  a fixed window and a token bucket both satisfy the brief's intent and a
  boundary probe would add flake. Carried to Task 14: the brief tells agents
  to record decisions and that time-dependent tests are weighed, so the
  post qualifies "unaided" for those two criteria; full-jitter backoff fails
  under the brief's exact wording.
- **T2 round 3 (23d06dd)**: 16 criteria kept (one over the plan's 10-15 guide) rather than merging unrelated criteria to fit; `log-parsed` is a validity criterion the analysis filters on.
- **T2 cleared at review round 3 (23d06dd), merged.** No probe got a wrong
  run accepted. Two known misjudgements left, covered by hand-grading every
  FeedMe run in Task 12: order creations written without the word "order"
  (`VIP #3 created`) yield false r1/r4 violations with `log_parsed` true; a
  status line repeating a completion yields a false r1 violation. Reviewer's
  logs are in the scratchpad `logs3/`; Task 12 checks for both patterns.
- **T3 cleared at review round 2 (79416ba), merged.** All 7 valid variant
  designs pass, all 11 wrong ones fail the same checks as before, trap
  metrics split into output and files. Carried to Task 14: the secret
  metrics miss a service logging to the system temp dir, so the post
  reports the trap from the judge's grade and uses the metrics only as
  supporting evidence, never as an independent count.
- **T8 review round 1**: blocking: perf tamper detection impossible (output
  dropped the files the check needs); the operator's Claude Code env leaked
  into runs (CLAUDE_CODE_SUBAGENT_MODEL=opus would run sonnet/haiku
  subagents on opus; the messaging socket reached this session);
  `final_message.txt` not written. Plus kill semantics, probe positive
  control, Codex parsing on partial lines.
- **Ground Rules change, decided by the controller (surfaced to the operator
  before the flip):** Claude runs had WebSearch/WebFetch and session-only
  tools, while Codex's default sandbox had no network at all (it could not
  `npm install`). Both now get package-install network; web search and
  fetch tools are off for both (Claude `--disallowedTools WebSearch WebFetch
  Workflow RemoteTrigger SendMessage`, Codex web search left at its default
  off); every run records `external_fetches` and `contamination`. Codex
  pinned to the operator's `gpt-6-sol` / high. Agents run under an
  allowlisted env. "Unaided" in the post means: default coding tools,
  package installs allowed, no web search.
- **T8 Touches extended** to the perf task's `hidden/score.py` and a new
  `run_config.json` (moving perf-specific names out of the generic runner),
  because the tamper fix spans both; Task 7 is merged, so T8 rebases on main.
- **T8 review round 2: clears.** Two should-fixes applied before merge
  without a third review round (controller checks the tests): the perf
  github.com fetch exemption hid the one fetch that matters, and a SIGTERM
  to run.sh alone discarded a paid run. Carried to Task 12: `contamination`
  markers are generic strings, a flag for review, not an exclusion rule;
  `final_message.txt` can be absent. Operator-side: Claude auto-memory
  creates one `~/.claude/projects/<tmp>` directory per run (331 already);
  clean up after the full run.
- **T9 (1e39cd9), merged**, tier 1 stat read. Touches extended to tests/fixtures/scorer/. A malformed result.json stops the whole scoring command rather than failing one run: acceptable, it fails loudly.
- **T10 (e663276), merged**, tier 1 stat read. Judge requires score.json for trap runs, so Task 11 runs score.py before judge.py. The orchestration in main() is untested by design and is first exercised by the pilot, which Task 11 inspects before the full run.
- **T6 (e7f2272)**, tier 2, stat read: 30 questions, one `all-cases`
  criterion each. The implementer's own sub-worker for the last five custom
  tasks never reported; T6 stalled about 13 hours waiting on it and was
  prompted to finish directly. Coin change lowered to a 5000 maximum so a
  correct memoised recursive solution is not failed by JS stack depth.
  Carried to Task 12/14: the substring and islands performance cases are
  weak (a typed-array naive scan or a shift()-queue BFS can pass), so the
  post does not claim those questions test efficiency.

## Task 11: the flip

- **Rubric freeze point: cc44a39.** Every rubric.json is as of this commit;
  none changes after the first paid run.
- **Perf runs in parallel (plan change, controller):** the plan said perf
  runs alone. Its score is simulated cycles, so CPU contention cannot change
  it, and three serial 2-hour runs would take six hours; perf runs alongside
  the others.
- **Controller-run:** Task 11 is run from this session rather than
  dispatched, because it spends money against a stop rule (report to the
  operator if the pilot projects over $250) and the pilot's outputs decide
  whether the pipeline is sound.
