"""Hidden checker for the FeedMe order controller take-home.

The upstream brief fixes no command syntax for the CLI, only that
scripts/test.sh, scripts/build.sh and scripts/run.sh exist, and that the run
writes an event log with HH:MM:SS timestamps to scripts/result.txt (the file
the upstream GitHub Action checks). So the checker does what that Action
does, then replays the candidate's own log against requirements 1 to 7.

Each requirement result means "not violated": it passes when the replayed
log never breaks the requirement. Whether the run showed the requirement at
all is a separate question, answered by the <id>_exercised metrics and the
demonstrates_all result.

A log the parser cannot read would pass every "not violated" result for
free, so a log with too few recognised events sets the log_unparsed metric
and fails the log_parsed result. The r1 to r6 and demonstrates_all results
are then false too, and the analysis excludes such runs from automated pass
rates and grades them by hand.

Usage: python3 check.py <solution_dir>
"""

import hashlib
import json
import os
import pathlib
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field

REQUIREMENT_IDS = [
    "r1_normal_order_flow",
    "r2_vip_priority",
    "r3_unique_increasing_numbers",
    "r4_bot_processing",
    "r5_idle_bot",
    "r6_remove_newest_bot",
]
PROCESSING_SECONDS = 10
# Timestamps are whole seconds, so a 10 s job can print as 10 or 11 s, and a
# reaction that is "immediate" can land in the next printed second.
PROCESSING_TOLERANCE = 1
REACTION_SECONDS = 1
SCRIPT_TIMEOUT_SECONDS = 600
RUN_TIMEOUT_SECONDS = 300
RESULT_FILES = {"scripts/result.txt", "result.txt"}
UNPARSED_SILENT_SHARE = 0.3
UNPARSED_MIN_EVENTS = 8
DAY_SECONDS = 86_400

TIMESTAMP = re.compile(r"(?<!\d)(\d{2}):(\d{2}):(\d{2})(?!\d)")
# Word starts use (?<![a-z]) rather than \b so snake_case names such as
# "order_created" or "bot_idle" still match.
ID_GAP = r"""["'\s:=#_-]*"""
ORDER_ID = re.compile(rf"(?<![a-z])order{ID_GAP}(?:(?:id|no|number)\.?{ID_GAP})?(\d+)", re.IGNORECASE)
BOT_ID = re.compile(rf"(?<![a-z])bot{ID_GAP}(?:(?:id|no|number)\.?{ID_GAP})?(\d+)", re.IGNORECASE)
BOT_WORD = re.compile(r"(?<![a-z])bot(?![a-z])", re.IGNORECASE)
REMOVE_WORDS = re.compile(r"(?<![a-z])(destroy|remov|delet|terminat|decommission|kill)", re.IGNORECASE)
CREATE_WORDS = re.compile(
    r"(?<![a-z])(creat|new(?![a-z])|add|placed|submit|receiv|spawn|queu|enqueu|arriv)", re.IGNORECASE
)
COMPLETE_WORDS = re.compile(r"(?<![a-z])(complet|finish|done(?![a-z])|served)", re.IGNORECASE)
PICKUP_WORDS = re.compile(
    r"(?<![a-z])(pick|process|start|assign|took|take|cook|handl|begin|began|work|prepar|grab)", re.IGNORECASE
)
IDLE_WORD = re.compile(r"(?<![a-z])idle(?![a-z])", re.IGNORECASE)
VIP_WORD = re.compile(r"(?<![a-z])(?<!non-)(?<!non )vip(?![a-z])", re.IGNORECASE)
SEGMENT_SPLIT = re.compile(r";|, | and | then ", re.IGNORECASE)
FROM_AFTER = re.compile(r"[a-z]*\s+from(?![a-z])", re.IGNORECASE)
RETURN_WORDS = re.compile(r"(?<![a-z])(return|back(?![a-z])|requeu|re-queu|re-add|restor)", re.IGNORECASE)


@dataclass
class Event:
    kind: str
    ts: int
    line: int
    order: int | None = None
    bot: int | None = None
    vip: bool = False


@dataclass
class Requirement:
    exercised: bool = False
    violations: list[str] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return not self.violations


@dataclass
class LogReading:
    events: list[Event]
    timestamped_lines: int
    silent_lines: int  # timestamped lines naming an order or bot that yielded no event
    last_ts: int | None

    @property
    def unparsed(self) -> bool:
        if len(self.events) < UNPARSED_MIN_EVENTS:
            return True
        return self.silent_lines > UNPARSED_SILENT_SHARE * self.timestamped_lines


def keyword_position(pattern: re.Pattern, text: str) -> int | None:
    match = pattern.search(text)
    return match.start() if match else None


def removal_position(text: str) -> int | None:
    """Where a bot removal keyword starts, or None when the removal is not a bot's."""
    match = REMOVE_WORDS.search(text)
    if not match:
        return None
    # "Order #1 removed from PENDING" moves an order, it does not remove a bot.
    if FROM_AFTER.match(text, match.end()):
        return None
    order_match = ORDER_ID.search(text)
    bot_match = BOT_ID.search(text)
    if order_match and bot_match and order_match.start() < match.start() < bot_match.start():
        return None
    return match.start()


def parse_segment(text: str, line: str, ts: int, line_no: int, context: dict) -> list[Event]:
    """Parse one clause of a line. context carries the bot and order the line
    has already named, for clauses such as "... and picked up Order #4"."""
    order_ids = {int(m) for m in ORDER_ID.findall(text)}
    bot_ids = {int(m) for m in BOT_ID.findall(text)}
    if len(order_ids) > 1 or len(bot_ids) > 1:
        return []  # a status line listing several orders or bots, not an event
    own_order = order_ids.pop() if order_ids else None
    own_bot = bot_ids.pop() if bot_ids else None
    bot = own_bot if own_bot is not None else context.get("bot")
    order = own_order if own_order is not None else context.get("order")
    names_something = own_bot is not None or own_order is not None
    if own_bot is not None:
        context["bot"] = own_bot
    if own_order is not None:
        context["order"] = own_order

    def event(kind, **extra):
        return Event(kind=kind, ts=ts, line=line_no, **extra)

    # When several event kinds could apply, the earliest keyword decides:
    # "destroyed while PROCESSING" is a removal, "completed ... Processing
    # time" a completion.
    candidates = []
    if own_bot is not None or BOT_WORD.search(text):
        candidates.append((removal_position(text), "bot_removed"))
    if own_bot is not None and own_order is None:
        candidates.append((keyword_position(CREATE_WORDS, text), "bot_added"))
    if names_something and bot is not None and order is not None:
        candidates.append((keyword_position(COMPLETE_WORDS, text), "completed"))
        candidates.append((keyword_position(PICKUP_WORDS, text), "picked"))
    found = sorted((pos, kind) for pos, kind in candidates if pos is not None)

    events = []
    if found:
        kind = found[0][1]
        if kind in ("bot_removed", "bot_added"):
            events.append(event(kind, bot=own_bot))
        else:
            events.append(event(kind, bot=bot, order=order))
    elif own_bot is None and own_order is not None and CREATE_WORDS.search(text) and not RETURN_WORDS.search(text):
        # The order type can sit in another clause: "New order #3, type: VIP".
        events.append(event("order_created", order=own_order, vip=bool(VIP_WORD.search(line))))

    # ", now IDLE" after a completion names no bot; it refers to the bot the
    # line was already about.
    idle_bot = own_bot if own_bot is not None else (None if names_something else context.get("bot"))
    removed = any(e.kind == "bot_removed" for e in events)
    if idle_bot is not None and IDLE_WORD.search(text) and not removed:
        events.append(event("idle", bot=idle_bot))
    return events


def read_log(text: str) -> LogReading:
    events = []
    timestamped = silent = 0
    day_offset = 0
    last_ts = None
    for line_no, line in enumerate(text.splitlines(), start=1):
        stamp = TIMESTAMP.search(line)
        if not stamp:
            continue
        timestamped += 1
        ts = int(stamp[1]) * 3600 + int(stamp[2]) * 60 + int(stamp[3]) + day_offset
        if last_ts is not None and ts < last_ts - DAY_SECONDS // 2:
            day_offset += DAY_SECONDS
            ts += DAY_SECONDS
        last_ts = ts
        line_events = []
        context: dict = {}
        for segment in SEGMENT_SPLIT.split(line):
            line_events += parse_segment(segment, line, ts, line_no, context)
        # A line naming no order or bot (a banner, a heartbeat) is not an
        # event the parser missed, so it does not count against the log.
        if not line_events and (ORDER_ID.search(line) or BOT_ID.search(line)):
            silent += 1
        events += line_events
    return LogReading(events=events, timestamped_lines=timestamped, silent_lines=silent, last_ts=last_ts)


@dataclass
class Order:
    vip: bool
    seq: int
    arrived: int
    returned: bool = False


@dataclass
class Bot:
    idle_since: int
    order: int | None = None
    picked_at: int = 0


def evaluate(events: list[Event], last_ts: int | None = None) -> dict[str, Requirement]:
    """Replay events; last_ts is the log's final timestamp, which may belong to a line with no event."""
    if last_ts is None:
        last_ts = events[-1].ts if events else 0
    req = {rid: Requirement() for rid in REQUIREMENT_IDS}
    orders: dict[int, Order] = {}
    pending: list[int] = []
    bots: dict[int, Bot] = {}  # insertion order is creation order
    removed: set[int] = set()
    idle_report_due: set[int] = set()
    reported_waits: set[tuple[int, int]] = set()
    counts = {"normal_completed": 0, "orders_created": 0, "bot_added_while_pending": 0,
              "moved_on": 0, "went_idle": 0, "order_for_idle_bot": 0,
              "removed_mid_order": 0, "returned_picked": 0, "completed": 0}

    def fail(rid, event, message):
        req[rid].violations.append(f"line {event.line}: {message}")

    def queue_key(order_id):
        order = orders[order_id]
        return (not order.vip, order.seq)

    for event in events:
        # A bot left idle while an order waits breaks requirement 4 if the
        # order was already waiting when the bot freed up, and requirement 5
        # if the order arrived while the bot sat idle.
        for bot_id, bot in bots.items():
            if bot.order is not None:
                continue
            for order_id in pending:
                arrived = orders[order_id].arrived
                if event.ts - max(arrived, bot.idle_since) > REACTION_SECONDS and (bot_id, order_id) not in reported_waits:
                    reported_waits.add((bot_id, order_id))
                    rid = "r5_idle_bot" if arrived > bot.idle_since else "r4_bot_processing"
                    fail(rid, event, f"bot {bot_id} stayed idle while order {order_id} was pending")

        if event.kind == "order_created":
            if event.order in orders:
                fail("r3_unique_increasing_numbers", event, f"order number {event.order} reused")
                continue
            if orders and event.order < max(orders):
                fail("r3_unique_increasing_numbers", event, f"order number {event.order} is lower than an earlier one")
            if any(bot.order is None for bot in bots.values()):
                counts["order_for_idle_bot"] += 1
            orders[event.order] = Order(vip=event.vip, seq=len(orders), arrived=event.ts)
            pending.append(event.order)
            counts["orders_created"] += 1

        elif event.kind == "bot_added":
            if pending:
                counts["bot_added_while_pending"] += 1
            removed.discard(event.bot)  # bot numbers may be reused after a removal
            bots[event.bot] = Bot(idle_since=event.ts)

        elif event.kind == "picked":
            if event.bot in removed:
                fail("r6_remove_newest_bot", event, f"removed bot {event.bot} picked up an order")
                continue
            bot = bots.get(event.bot)
            if bot is None:
                fail("r4_bot_processing", event, f"unknown bot {event.bot} picked up an order")
                continue
            if bot.order == event.order:
                continue  # a status line repeating the current assignment
            if bot.order is not None:
                fail("r4_bot_processing", event, f"bot {event.bot} picked a second order while busy")
                continue
            if event.bot in idle_report_due:
                idle_report_due.discard(event.bot)
                fail("r5_idle_bot", event, f"bot {event.bot} took a new order without reporting IDLE after its last one")
            if event.order not in pending:
                fail("r4_bot_processing", event, f"order {event.order} was picked but was not pending")
                continue
            head = min(pending, key=queue_key)
            if event.order != head:
                rid = "r6_remove_newest_bot" if orders[event.order].returned or orders[head].returned else "r2_vip_priority"
                fail(rid, event, f"picked order {event.order} ahead of order {head}")
            if any(orders[v].vip and any(not orders[n].vip and orders[n].seq < orders[v].seq for n in pending)
                   for v in pending):
                req["r2_vip_priority"].exercised = True
            if orders[event.order].returned:
                counts["returned_picked"] += 1
            pending.remove(event.order)
            bot.order = event.order
            bot.picked_at = event.ts

        elif event.kind == "completed":
            if event.bot in removed:
                fail("r6_remove_newest_bot", event, f"removed bot {event.bot} completed order {event.order}")
                continue
            bot = bots.get(event.bot)
            if bot is None or bot.order != event.order:
                in_progress = any(b.order == event.order for b in bots.values())
                known = orders.get(event.order)
                if not in_progress and (known is None or not known.vip):
                    fail("r1_normal_order_flow", event, f"order {event.order} completed without a pickup")
                else:
                    fail("r4_bot_processing", event, f"bot {event.bot} completed order {event.order} it was not processing")
                continue
            took = event.ts - bot.picked_at
            if not PROCESSING_SECONDS <= took <= PROCESSING_SECONDS + PROCESSING_TOLERANCE:
                fail("r4_bot_processing", event, f"order {event.order} took {took}s, not {PROCESSING_SECONDS}s")
            counts["completed"] += 1
            if not orders[event.order].vip:
                counts["normal_completed"] += 1
            bot.order = None
            bot.idle_since = event.ts
            if pending:
                counts["moved_on"] += 1
            else:
                counts["went_idle"] += 1
                idle_report_due.add(event.bot)

        elif event.kind == "idle":
            bot = bots.get(event.bot)
            if bot is not None and bot.order is not None:
                fail("r5_idle_bot", event, f"bot {event.bot} reported IDLE while processing order {bot.order}")
            idle_report_due.discard(event.bot)

        elif event.kind == "bot_removed":
            if not bots:
                continue
            newest = list(bots)[-1]
            target = newest if event.bot is None else event.bot
            if target not in bots:
                fail("r6_remove_newest_bot", event, f"removed bot {target}, which does not exist")
                continue
            if target != newest:
                fail("r6_remove_newest_bot", event, f"removed bot {target}, but the newest bot is {newest}")
            bot = bots.pop(target)
            removed.add(target)
            idle_report_due.discard(target)
            if bot.order is not None:
                orders[bot.order].returned = True
                orders[bot.order].arrived = event.ts
                pending.append(bot.order)
                counts["removed_mid_order"] += 1

    def fail_at_end(rid, message):
        req[rid].violations.append(f"end of log: {message}")

    for bot_id in idle_report_due:
        fail_at_end("r5_idle_bot", f"bot {bot_id} never reported IDLE after its last order")
    idle_bots = [bot_id for bot_id, bot in bots.items() if bot.order is None]
    for order_id in pending:
        if idle_bots:
            fail_at_end("r5_idle_bot", f"order {order_id} still pending while bot {idle_bots[0]} is idle")
        order = orders[order_id]
        free_for = max((last_ts - max(order.arrived, bots[b].idle_since) for b in idle_bots), default=0)
        if not order.vip and free_for > PROCESSING_SECONDS + PROCESSING_TOLERANCE:
            fail_at_end("r1_normal_order_flow", f"normal order {order_id} never completed though a bot was free for {free_for}s")
    for bot_id, bot in bots.items():
        if bot.order is not None and last_ts - bot.picked_at > PROCESSING_SECONDS + PROCESSING_TOLERANCE:
            fail_at_end("r4_bot_processing", f"bot {bot_id} picked order {bot.order} {last_ts - bot.picked_at}s before the log ended and never completed it")

    req["r1_normal_order_flow"].exercised = counts["normal_completed"] > 0
    req["r3_unique_increasing_numbers"].exercised = counts["orders_created"] >= 2
    req["r4_bot_processing"].exercised = (
        counts["completed"] > 0 and counts["moved_on"] > 0 and counts["bot_added_while_pending"] > 0
    )
    req["r5_idle_bot"].exercised = counts["went_idle"] > 0 and counts["order_for_idle_bot"] > 0
    req["r6_remove_newest_bot"].exercised = counts["removed_mid_order"] > 0 and counts["returned_picked"] > 0
    return req


def score(log: str) -> tuple[dict[str, bool], dict[str, int]]:
    """Replay a result.txt; return the r1 to r6, demonstrates_all and log_parsed results with their metrics."""
    reading = read_log(log)
    requirements = evaluate(reading.events, reading.last_ts)
    parsed = not reading.unparsed
    results = {rid: parsed and r.passed for rid, r in requirements.items()}
    results["demonstrates_all"] = parsed and all(r.exercised for r in requirements.values())
    results["log_parsed"] = parsed
    metrics = {
        "events_parsed": len(reading.events),
        "timestamped_lines": reading.timestamped_lines,
        "silent_lines": reading.silent_lines,
        "log_unparsed": int(reading.unparsed),
    }
    for rid, r in requirements.items():
        metrics[f"{rid}_exercised"] = int(r.exercised)
        metrics[f"{rid}_violations"] = len(r.violations)
        for violation in r.violations:
            print(f"{rid}: {violation}", file=sys.stderr)
    return results, metrics


def snapshot(root: pathlib.Path) -> dict[str, str]:
    files = {}
    for path in root.rglob("*"):
        rel = path.relative_to(root)
        if "node_modules" in rel.parts or ".git" in rel.parts or not path.is_file():
            continue
        files[rel.as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    return files


def run_script(root: pathlib.Path, name: str, timeout: int) -> bool:
    script = root / "scripts" / name
    if not script.is_file():
        return False
    env = dict(os.environ, TZ="UTC", CI="true")
    proc = subprocess.Popen(
        ["bash", str(script)],
        cwd=root,
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    try:
        return proc.wait(timeout=timeout) == 0
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGKILL)
        proc.wait()
        return False
    finally:
        # A script's background children (a CLI left running) must not outlive it.
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass


def check_solution(solution: pathlib.Path) -> dict:
    work = pathlib.Path(tempfile.mkdtemp(prefix="feedme-check-"))
    try:
        root = work / "solution"
        shutil.copytree(solution, root, ignore=shutil.ignore_patterns("node_modules", ".git"), symlinks=True)
        # The scaffold ships a sample scripts/result.txt; only a file the run
        # itself writes counts as output.
        for name in RESULT_FILES:
            (root / name).unlink(missing_ok=True)

        started = time.monotonic()
        tests_ok = run_script(root, "test.sh", SCRIPT_TIMEOUT_SECONDS)
        build_ok = run_script(root, "build.sh", SCRIPT_TIMEOUT_SECONDS)
        before = snapshot(root)
        run_started = time.monotonic()
        run_ok = run_script(root, "run.sh", RUN_TIMEOUT_SECONDS)
        run_seconds = time.monotonic() - run_started
        after = snapshot(root)

        scripts_result = root / "scripts" / "result.txt"
        root_result = root / "result.txt"
        log_path = scripts_result if scripts_result.is_file() else root_result
        log = log_path.read_text(errors="replace") if log_path.is_file() else ""
        ci_ok = (
            tests_ok and build_ok and run_ok and scripts_result.is_file()
            and TIMESTAMP.search(scripts_result.read_text(errors="replace")) is not None
        )
        written = {p for p in after if after[p] != before.get(p)} - RESULT_FILES
        written = {p for p in written if not p.endswith(".log")}
        in_memory = run_ok and not written

        log_results, log_metrics = score(log)
        results = [{"id": "ci_verify", "passed": ci_ok}]
        results += [{"id": rid, "passed": passed} for rid, passed in log_results.items()]
        results.append({"id": "r7_in_memory", "passed": in_memory})
        metrics = {
            **log_metrics,
            "run_seconds": round(run_seconds, 1),
            "total_seconds": round(time.monotonic() - started, 1),
            "tests_ok": int(tests_ok),
            "build_ok": int(build_ok),
            "run_ok": int(run_ok),
            "files_written_by_run": len(written),
        }
        return {"results": results, "metrics": metrics}
    finally:
        shutil.rmtree(work, ignore_errors=True)


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: check.py <solution_dir>", file=sys.stderr)
        return 2
    solution = pathlib.Path(argv[0]).resolve()
    if not solution.is_dir():
        print(f"solution directory {solution} does not exist", file=sys.stderr)
        return 2
    print(json.dumps(check_solution(solution)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
