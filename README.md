# interview-signal

What each technical-interview format still measures about a candidate once
the candidate, and the job, has a coding agent.

Real and authored interview tasks are given, unaided, to headless coding
agents (Claude Code and Codex). Every criterion an agent meets on its own is a
criterion that tells an interviewer nothing about the person in front of
them. This repo is the harness, the tasks and the data behind
[Your Interview Measures the Agent, Not the Candidate](https://dikrana.dev/blog/interview-measures-the-agent/),
and [`ANALYSIS.md`](ANALYSIS.md) has every headline number.

## Result in one table

438 runs. Agents: `claude-sonnet-5-5`, `claude-opus-5-5`, Codex `gpt-6-sol`
(high), and `claude-haiku-4-5-20251001` on algorithms only.

| Format | What every agent did unaided | Where agents differed |
| --- | --- | --- |
| Take-home (3 tasks) | met every automated correctness criterion in every run | judged criteria: open questions, edge cases, honest reporting; and the trap |
| Trap requirements | no agent complied silently | Claude pushed back 20 of 20; Codex complied and flagged 9 of 10 |
| Comprehension (6 planted bugs) | found every code-visible and cross-function bug | without the README, the 2 domain-rule bugs were explained 3 of 30 times |
| Algorithms (30 questions) | Sonnet, Opus, Codex passed 90 of 90 each | only Haiku failed any (15 of 90); 21 questions carry no signal |
| Perf take-home | Sonnet 1,031, Opus 1,050, Codex 1,297 cycles | all below Anthropic's best published model result |

## How a run works

`run.sh` gives one task to one agent in a fresh Docker container:

- the image `interview-signal-agent` (Debian, Node 24, Python 3, git, the
  Claude Code and Codex CLIs at the host's versions), run as a non-root
  `candidate` user with no capabilities and `no-new-privileges`;
- only the run's work dir is mounted, at `/work`, holding a copy of the
  task's `workspace/` and nothing else; no SSH, `gh`, keychain or host paths;
- a dedicated Docker network with inter-container traffic off and firewall
  rules in the Colima VM that drop every private and link-local range, so a
  run reaches the internet (model APIs, npm, PyPI) and nothing on the host or
  LAN; every run and scoring pass checks this first and fails loudly if the
  rules are missing;
- Claude: `claude -p` with `--setting-sources project --strict-mcp-config`,
  tools limited to `Bash Edit Glob Grep Read Write TodoWrite Task`, web search
  and fetch disallowed, authenticated by a long-lived inference-only token
  passed as an environment variable;
- Codex: `codex exec --sandbox danger-full-access` (the container is the
  boundary; Codex's own sandbox cannot start inside it) with a scratch
  `CODEX_HOME` whose `config.toml` pins the model and effort and switches off
  web search, app connectors, browser, computer-use, plugin and image tools.

The prompt is the task exactly as a candidate would paste it, plus one
neutral line. Agents never see rubrics, traps, answer keys or hidden checks.

## Scoring

- `score.py` runs each task's `hidden/run.sh` against the run's `output/`,
  inside the same container image and network, and writes `score.json`.
- `judge.py` grades the criteria that cannot be automated, and the traps,
  with three Claude Opus votes each; majority wins, unanimity is recorded.
- `analyze.py` prints every number the post quotes, the isolation audit of
  every transcript, and the incident report.
- `handcheck.json` holds a blind relabelling, by a fresh Claude agent rather
  than a human, of a seeded 20% of judge labels and all 15 FeedMe runs.

## Tasks

| Task | Source | Licence |
| --- | --- | --- |
| `takehome/feedme` | [feedmepos/se-take-home-assignment](https://github.com/feedmepos/se-take-home-assignment) at `2652e3c` | Apache-2.0 |
| `takehome/webhook-relay` | authored, with one trap requirement | MIT |
| `takehome/existing-repo` | authored ~1,500-line bookings service, with one trap requirement | MIT |
| `comprehension/billing-{with,no}-readme` | authored module with 6 planted bugs | MIT |
| `algorithms/*` | 10 known problems (statements paraphrased, referenced by LeetCode number), 10 modified variants, 10 custom | MIT |
| `perf/anthropic-original` | [anthropics/original_performance_takehome](https://github.com/anthropics/original_performance_takehome) at `5452f74` | none: fetched at run time, never redistributed |

`check_tasks.py` validates every task before any paid run: the hidden checks
pass on the reference and fail on the starting workspace, and no prompt
mentions rubrics, traps or hidden checks.

## Running it

Requires Docker (Colima on macOS), Node 24, Python 3.11+, `jq`, logged-in
`claude` and `codex` CLIs, and a Claude token created once with
`claude setup-token` and saved, mode 0600, at
`~/.config/interview-signal/claude-oauth-token`.

```sh
./run.sh --build-image          # build the agent image
./run.sh --setup-network        # create the runs network and VM firewall rules (again after a Colima restart)
./run.sh --check-isolation      # confirm the network is walled off
./probe.sh                      # prove no instructions, credentials or tools leak into a session
python3 check_tasks.py          # validate every task
JOBS=6 ./run.sh                 # all runs; skips any already in runs/
python3 score.py                # score in containers
python3 judge.py                # judge (score first: trap grading reads score.json)
python3 analyze.py --transcripts .
```

`run.sh` takes `FORMATS`, `TASKS`, `AGENTS`, `REPS`, `JOBS` and `BUDGET` from
the environment. Runs draw on the logged-in accounts' usage.

## What is committed

`runs/<format>__<task>__<agent>__r<rep>/` keeps `result.json`, the agent's
final workspace in `output/`, `final_message.txt`, `score.json` and
`judge.json`. Transcripts and stderr are gitignored because they carry
machine paths. `runs-excluded/` keeps the 20 runs set aside after the
incidents below, as evidence.

## Incidents

Isolation was built in rounds, and two gaps reached real systems:

1. The first 15 FeedMe runs ran with the operator's real `HOME`. The FeedMe
   brief tells candidates to fork and open a pull request, and all five Codex
   runs did so with the operator's `gh` login: four public PRs on the
   upstream repo and one on a stranger's solution repo, which that run found
   and read. All five PRs were closed with an apology and both forks deleted.
2. In the first container rerun, three Codex runs used the ChatGPT GitHub
   connector that comes with the Codex login, read-only, as the operator.
   Connectors and the other extra tools are now off and the probe fails on
   any connector call.

Both groups were rerun; `ANALYSIS.md` and the post describe them.

## Limitations

- Only the 15 FeedMe runs ran in the container; the other 423 ran on the host
  with environment-only isolation, before the incidents. Their transcripts
  were audited and show no credential use, pushes, web search or connector
  calls, but they had the operator's credentials within reach, and scoring
  of those runs executed the agents' own tests on the host.
  Those host runs also had Codex web search available (never used) and ran
  Claude without `--strict-mcp-config`; one resumed session had the
  operator's claude.ai connectors attached and called none of them.
- The webhook brief asks candidates to record their decisions and says
  time-dependent tests are weighed, so those criteria measure following an
  instruction rather than unprompted judgment.
- The Claude token and the Codex credential are readable inside a run; the
  Codex one is the operator's full ChatGPT login.
- Scoring mounts the whole format folder, so scored code could read other
  tasks' answer keys; a solution's own tests run as the same user as the
  checker.
- Judge spend is only partly recorded; one batch's cost is estimated.
- Tasks are small, rubrics are the author's, and three repeats per cell (five
  for take-homes) is enough to show a pattern, not to pin rates.

## Licence

MIT, except `tasks/takehome/feedme/workspace` (Apache-2.0, upstream) and the
perf take-home, which is fetched and not redistributed.
