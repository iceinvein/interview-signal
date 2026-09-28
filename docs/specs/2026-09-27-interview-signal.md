# Design: interview-signal

What does each interview format still measure about a candidate when the
candidate, and the job, has a coding agent?

## Question and measurement

An interview criterion carries signal about a person only where an agent,
used unaided, fails it or is inconsistent on it. If three current agents meet
a criterion in every run, a candidate meeting it tells you they can paste a
task into an agent. So for every format the experiment measures, per
criterion or per question:

- **agent pass rate**: share of runs in which the agent, given only the task,
  meets it
- **agent variance**: whether repeated runs disagree
- **discrimination** (algorithm format only): whether the question orders
  models of different strength the way it is supposed to order candidates

The post's claim takes the shape "these criteria/questions still carry
signal, these do not", with numbers, per format.

## Formats and tasks

### A. Take-home build

Three tasks, each with a hidden acceptance suite, a hand-written rubric of 10
to 15 criteria, and one planted trap requirement.

1. **FeedMe order controller** (public, Apache-2.0,
   `feedmepos/se-take-home-assignment` pinned by SHA). A real company
   take-home that explicitly allows AI. Backend CLI variant in Node. Public
   forks with solutions exist, so it doubles as a contamination control:
   agents may have seen it, candidates can find it.
2. **Authored spec task**: a small service from an ambiguous product brief
   (working idea: a webhook relay with retries and per-tenant rate limits),
   written for this experiment so no model or candidate has seen it.
3. **Authored existing-repo task**: add a feature to a provided ~1,500-line
   TypeScript repo. Tests whether the agent reads the codebase's conventions
   or bolts on its own.

**Trap requirement**: each spec contains one requirement a good engineer
should question: one that contradicts another requirement, or is unsafe
(for example, logging full request bodies containing credentials). Measured
as: did the agent comply silently, comply and flag, or push back.

**Rubric**: written before any run, split into correctness (automated where
possible via the hidden suite), tests the agent wrote, design and code
quality, and "questions a strong candidate would ask". Criteria are frozen in
the repo with a commit before the first run.

### B. Comprehension round

Google-style: a ~300-line TypeScript module with 6 planted bugs of graded
subtlety: 2 visible from the code alone, 2 that need tracing across
functions, 2 that are only bugs relative to a stated domain rule in the
README. Prompt: find and explain the bugs. Scored on bugs found, false
positives, and explanation correctness. Reuses the mutgap result: expect the
domain-rule bugs to be missed without the README and caught with it, so run
both conditions.

### C. Algorithm questions

30 questions with hidden test suites:

- 10 well-known problems, referenced by LeetCode ID, statements paraphrased
  (LeetCode text is not redistributed)
- 10 modified variants of those (changed constraint or twist)
- 10 custom problems written for this experiment

Per question: pass rate per model. Discrimination: does the question order
the models by strength? That needs at least three clearly different
strengths, so this format adds **Claude Haiku 4.5** as the weak model
(open question 1). Questions every model passes are the ones that carry no
signal in an AI-allowed round.

### D. Anthropic performance take-home (anchor)

`anthropics/original_performance_takehome`, pinned by SHA, fetched at run
time and not redistributed (the repo has no license). Each agent gets a
2-hour wall-clock cap and a dollar cap (open question 2), one run each.
Reported as cycles against Anthropic's published human and model baselines,
which will be read from the primary page before being quoted.

## Agents

- Claude Sonnet 5 and Claude Opus 5.5 via `claude -p`, with
  `--setting-sources project` (verified in mutgap to keep the operator's
  CLAUDE.md, hooks and plugins out)
- Codex via `codex exec`, with `CODEX_HOME` pointed at a scratch directory
  holding only `auth.json` and a minimal `config.toml`, so the operator's
  global `~/.codex/AGENTS.md` does not leak in. Model and CLI version
  recorded per run. A probe run verifies the isolation before any real run,
  as in mutgap.
- Claude Haiku 4.5 for format C only, if agreed.

Each run is a fresh session in an empty temporary directory outside the
repository, given the task exactly as a candidate would paste it, plus one
neutral line ("Complete this take-home." or equivalent). No hints about
traps, rubrics or bugs. The agent never sees hidden suites or rubrics.

## Repeats and scale

| Format | Tasks | Agents | Repeats | Runs |
|---|---|---|---|---|
| A take-home | 3 | 3 | 5 | 45 |
| B comprehension | 1 × 2 conditions | 3 | 5 | 30 |
| C algorithms | 30 | 4 | 3 | 360 |
| D perf take-home | 1 | 3 | 1 | 3 |

Estimated Claude usage, API-priced: A about $60, B about $15, C about $40,
D up to $75 with a $25 cap per run. About $190 in total, plus Codex usage on
the operator's OpenAI plan. The pilot (one task per format, one repeat)
comes first and replaces these estimates with measured ones.

## Grading

- **Automated**: hidden acceptance suites for A and C, cycle counts for D,
  planted-bug matching for B (a finding counts if it names the right
  location and the right failure).
- **Rubric criteria that can't be automated** (design, the agent's own
  tests, questions asked, trap handling): an Opus judge with a fixed rubric,
  three votes per criterion, majority wins, unanimity recorded.
- **Human check**: the operator hand-grades a seeded 20% sample of judged
  criteria and the post reports agreement. The operator is a hiring-side
  engineer, which makes this a stronger check than the second-reader check
  in mutgap (open question 3).

## Repository layout

Mirrors mutgap: `tasks/<format>/<id>/` (spec, hidden suite, rubric, meta),
`run.sh` (fresh session per run, all three CLIs), `score.py`, `judge.py`,
`analyze.py`, `check_tasks.py` (validates every task before paid runs: the
hidden suite passes on a reference solution and fails on the empty scaffold;
rubric frozen). Raw transcripts gitignored; suites, outputs, scores and
labels committed.

## The post's disclosure

A section stating that the author built and published an interview overlay
(`interview-helper`, March to May 2026), what building it taught about what a
live round can and cannot detect, and what that implies for interview design.
No usage instructions, no promotional link to the tool. Framed for the
hiring-manager half of the audience.

## Out of scope

- System design rounds: no defensible automated grading; mentioned, not
  measured.
- Behavioural rounds.
- Live human candidates: this measures what agents do unaided, which is the
  floor a candidate's own contribution has to clear. It does not measure
  candidates.

## Risks

- **Contamination**: FeedMe and the well-known algorithm problems are public.
  That is part of the finding (candidates can find them too), and the
  authored tasks and custom questions are the control.
- **Judge reliability**: mitigated by three votes and the operator's hand
  check; headline numbers come from automated suites where possible.
- **Codex isolation**: verified by probe before any run.
- **Perf take-home cost**: long sessions; capped per run, one run per agent.
- **Rubric authorship bias**: the author writes the rubric, so it is frozen
  and committed before the first run, and published.

## Decisions at sign-off (2026-09-27)

1. Claude Haiku 4.5 joins format C only.
2. Perf take-home: 2-hour wall-clock cap and $25 per run, one run per agent.
3. The 20% hand-check sample is graded by Claude (the authoring session),
   not the operator, and the post says so.
4. Claude builds both authored take-homes: a webhook relay (A2) and a feature
   on a purpose-built ~1,500-line TypeScript repo (A3).
