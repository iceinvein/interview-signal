"""Tests for the FeedMe hidden checker.

Run with: python3 -m unittest discover -s tasks/takehome/feedme/hidden
"""

import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import textwrap
import unittest

HIDDEN = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HIDDEN))

import check  # noqa: E402

LOGS = HIDDEN / "fixtures" / "logs"

# A run that satisfies requirements 1 to 6, written by hand from the upstream
# README and the shape of its sample scripts/result.txt.
GOOD_LOG = """\
McDonald's Order Management System - Simulation Results

[00:00:00] System initialised with 0 bots
[00:00:00] Created Normal Order #1 - Status: PENDING
[00:00:00] Created Normal Order #2 - Status: PENDING
[00:00:00] Created VIP Order #3 - Status: PENDING
[00:00:01] Bot #1 created - Status: ACTIVE
[00:00:01] Bot #1 picked up VIP Order #3 - Status: PROCESSING
[00:00:01] Bot #2 created - Status: ACTIVE
[00:00:01] Bot #2 picked up Normal Order #1 - Status: PROCESSING
[00:00:02] Bot #2 destroyed while PROCESSING - Normal Order #1 returned to PENDING
[00:00:03] Created VIP Order #4 - Status: PENDING
[00:00:11] Bot #1 completed VIP Order #3 - Status: COMPLETE (Processing time: 10s)
[00:00:11] Bot #1 picked up VIP Order #4 - Status: PROCESSING
[00:00:12] Bot #3 created - Status: ACTIVE
[00:00:12] Bot #3 picked up Normal Order #1 - Status: PROCESSING
[00:00:21] Bot #1 completed VIP Order #4 - Status: COMPLETE (Processing time: 10s)
[00:00:21] Bot #1 picked up Normal Order #2 - Status: PROCESSING
[00:00:22] Bot #3 completed Normal Order #1 - Status: COMPLETE (Processing time: 10s)
[00:00:22] Bot #3 is now IDLE - No pending orders
[00:00:23] Created Normal Order #5 - Status: PENDING
[00:00:23] Bot #3 picked up Normal Order #5 - Status: PROCESSING
[00:00:31] Bot #1 completed Normal Order #2 - Status: COMPLETE (Processing time: 10s)
[00:00:31] Bot #1 is now IDLE - No pending orders
[00:00:33] Bot #3 completed Normal Order #5 - Status: COMPLETE (Processing time: 10s)
[00:00:33] Bot #3 is now IDLE - No pending orders

Final Status:
- Orders Completed: 5
"""


def results_for(log):
    return check.evaluate(check.read_log(textwrap.dedent(log)).events)


def score(log):
    return check.score(textwrap.dedent(log))


class GoodRun(unittest.TestCase):
    def test_correct_run_passes_requirements_one_to_six(self):
        results = results_for(GOOD_LOG)
        for rid in check.REQUIREMENT_IDS:
            self.assertTrue(results[rid].passed, (rid, results[rid].violations))

    def test_correct_run_demonstrates_every_requirement(self):
        results, metrics = score(GOOD_LOG)
        self.assertTrue(results["demonstrates_all"])
        self.assertEqual(metrics["log_unparsed"], 0)

    def test_log_without_timestamps_passes_nothing(self):
        results, metrics = score("Added 1 bot\nstatus: bot: [1], order: []\n")
        self.assertFalse(any(results.values()), results)
        self.assertEqual(metrics["log_unparsed"], 1)


class Parsing(unittest.TestCase):
    def test_alternative_wording_is_understood(self):
        events = check.read_log(
            "12:00:00 New VIP order 7 received (PENDING)\n"
            "12:00:01 Bot 2 added\n"
            "12:00:01 Order 7 picked up by Bot 2\n"
            "12:00:11 Order 7 finished by Bot 2\n"
            "12:00:11 Bot 2 idle\n"
            "12:00:12 Removed Bot 2\n"
        ).events
        kinds = [(e.kind, e.order, e.bot) for e in events]
        self.assertEqual(
            kinds,
            [
                ("order_created", 7, None),
                ("bot_added", None, 2),
                ("picked", 7, 2),
                ("completed", 7, 2),
                ("idle", None, 2),
                ("bot_removed", None, 2),
            ],
        )
        self.assertTrue(events[0].vip)

    def test_pickup_line_that_mentions_completion_is_a_pickup(self):
        events = check.read_log("[10:00:00] Bot #1 picked up Order #3, will complete in 10s\n").events
        self.assertEqual([e.kind for e in events], ["picked"])

    def test_completion_line_that_also_reports_idle_yields_both(self):
        events = check.read_log("[10:00:10] Bot #1 completed Order #1, now IDLE\n").events
        self.assertEqual([e.kind for e in events], ["completed", "idle"])


class VipPriority(unittest.TestCase):
    def test_normal_order_picked_while_vip_waits_fails(self):
        results = results_for(
            """\
            [00:00:00] Created Normal Order #1 - Status: PENDING
            [00:00:00] Created VIP Order #2 - Status: PENDING
            [00:00:01] Bot #1 created
            [00:00:01] Bot #1 picked up Normal Order #1
            """
        )
        self.assertFalse(results["r2_vip_priority"].passed)
        self.assertTrue(results["r2_vip_priority"].exercised)

    def test_vip_picked_ahead_of_earlier_vip_fails(self):
        results = results_for(
            """\
            [00:00:00] Created Normal Order #1 - Status: PENDING
            [00:00:00] Created VIP Order #2 - Status: PENDING
            [00:00:00] Created VIP Order #3 - Status: PENDING
            [00:00:01] Bot #1 created
            [00:00:01] Bot #1 picked up VIP Order #3
            """
        )
        self.assertFalse(results["r2_vip_priority"].passed)

    def test_run_where_no_vip_ever_jumps_the_queue_is_not_exercised(self):
        results = results_for(
            """\
            [00:00:00] Created VIP Order #1 - Status: PENDING
            [00:00:00] Created Normal Order #2 - Status: PENDING
            [00:00:01] Bot #1 created
            [00:00:01] Bot #1 picked up VIP Order #1
            """
        )
        self.assertFalse(results["r2_vip_priority"].exercised)
        self.assertTrue(results["r2_vip_priority"].passed)


class Parsing2(unittest.TestCase):
    def test_iso_timestamps_are_read(self):
        events = check.read_log("[2026-09-28T12:00:05.000Z] Created VIP Order #3\n").events
        self.assertEqual([(e.kind, e.ts) for e in events], [("order_created", 12 * 3600 + 5)])

    def test_status_line_naming_several_orders_is_skipped(self):
        events = check.read_log("[12:00:12] Status - PENDING: Order #2 | Bots: Bot #1 (processing Order #4)\n").events
        self.assertEqual(events, [])

    def test_non_vip_order_is_normal(self):
        events = check.read_log("[12:00:00] Created non-VIP Order #1\n").events
        self.assertFalse(events[0].vip)

    def test_semicolon_separates_two_events_on_one_line(self):
        events = check.read_log("[12:00:11] Bot #1 completed Order #3; Bot #1 picked up Order #4\n").events
        self.assertEqual([(e.kind, e.order) for e in events], [("completed", 3), ("picked", 4)])

    def test_ids_written_as_key_value_pairs_are_read(self):
        events = check.read_log("[12:00:01] bot_id=2 picked up order_id=7\n").events
        self.assertEqual([(e.kind, e.bot, e.order) for e in events], [("picked", 2, 7)])

    def test_order_number_after_the_word_no_is_read(self):
        events = check.read_log("[12:00:00] Created order no. 12\n").events
        self.assertEqual([(e.kind, e.order) for e in events], [("order_created", 12)])

    def test_earliest_keyword_decides_between_pickup_and_removal(self):
        events = check.read_log("[12:00:12] Bot #1 picked up Order #1 (returned when a bot was removed)\n").events
        self.assertEqual([e.kind for e in events], ["picked"])

    def test_clock_passing_midnight_keeps_counting_forward(self):
        events = check.read_log(
            "[23:59:55] Bot #1 picked up Order #1\n[00:00:05] Bot #1 completed Order #1\n"
        ).events
        self.assertEqual(events[1].ts - events[0].ts, 10)


VALID_LOGS = ["A", "A2", "B", "base", "D", "D2", "E", "E2", "F", "G", "G2", "H"]
# Each wrong log breaks one requirement on purpose; the value names it.
WRONG_LOGS = {
    "W1": "r2_vip_priority",
    "W2": "r2_vip_priority",
    "W3": "r3_unique_increasing_numbers",
    "W4": "r4_bot_processing",
    "W5": "r6_remove_newest_bot",
    "W6": "r4_bot_processing",
    "W7": "r6_remove_newest_bot",
    "W8": "r4_bot_processing",
}


class UnparsedGate(unittest.TestCase):
    def test_log_with_many_unrecognised_lines_is_unparsed(self):
        noise = "".join(f"[00:00:{40 + i}] heartbeat\n" for i in range(12))
        _, metrics = score(GOOD_LOG + noise)
        self.assertEqual(metrics["log_unparsed"], 1)

    def test_parsed_run_without_a_bot_removal_does_not_demonstrate_all(self):
        results, metrics = score(
            """\
            [00:00:00] Created Normal Order #1 - Status: PENDING
            [00:00:00] Created VIP Order #2 - Status: PENDING
            [00:00:01] Bot #1 created
            [00:00:01] Bot #1 picked up VIP Order #2
            [00:00:11] Bot #1 completed VIP Order #2
            [00:00:11] Bot #1 picked up Normal Order #1
            [00:00:21] Bot #1 completed Normal Order #1
            [00:00:21] Bot #1 is now IDLE
            [00:00:22] Created Normal Order #3 - Status: PENDING
            [00:00:22] Bot #1 picked up Normal Order #3
            """
        )
        self.assertEqual(metrics["log_unparsed"], 0)
        self.assertTrue(results["r6_remove_newest_bot"])
        self.assertFalse(results["demonstrates_all"])


class ReviewerLogs(unittest.TestCase):
    def test_valid_logs_in_other_formats_pass_and_demonstrate_everything(self):
        for name in VALID_LOGS:
            with self.subTest(log=name):
                results, metrics = check.score((LOGS / f"{name}.txt").read_text())
                self.assertEqual(metrics["log_unparsed"], 0)
                self.assertTrue(all(results.values()), results)

    def test_tabular_log_trips_the_unparsed_gate(self):
        _, metrics = check.score((LOGS / "C.txt").read_text())
        self.assertEqual(metrics["log_unparsed"], 1)

    def test_wrong_logs_fail_the_requirement_they_break(self):
        for name, rid in WRONG_LOGS.items():
            with self.subTest(log=name):
                results, metrics = check.score((LOGS / f"{name}.txt").read_text())
                self.assertEqual(metrics["log_unparsed"], 0)
                self.assertFalse(results[rid], results)


class OrderNumbers(unittest.TestCase):
    def test_repeated_order_number_fails(self):
        results = results_for(
            """\
            [00:00:00] Created Normal Order #1 - Status: PENDING
            [00:00:00] Created Normal Order #1 - Status: PENDING
            """
        )
        self.assertFalse(results["r3_unique_increasing_numbers"].passed)

    def test_decreasing_order_number_fails(self):
        results = results_for(
            """\
            [00:00:00] Created Normal Order #5 - Status: PENDING
            [00:00:00] Created Normal Order #4 - Status: PENDING
            """
        )
        self.assertFalse(results["r3_unique_increasing_numbers"].passed)

    def test_increasing_order_numbers_pass(self):
        results = results_for(
            """\
            [00:00:00] Created Normal Order #1001 - Status: PENDING
            [00:00:00] Created VIP Order #1002 - Status: PENDING
            """
        )
        self.assertTrue(results["r3_unique_increasing_numbers"].passed)


class BotProcessing(unittest.TestCase):
    def test_order_completed_before_ten_seconds_fails(self):
        log = GOOD_LOG.replace(
            "[00:00:11] Bot #1 completed VIP Order #3", "[00:00:05] Bot #1 completed VIP Order #3"
        )
        self.assertFalse(results_for(log)["r4_bot_processing"].passed)

    def test_order_completed_after_five_seconds_fails(self):
        results = results_for(
            """\
            [00:00:00] Created Normal Order #1 - Status: PENDING
            [00:00:00] Created Normal Order #2 - Status: PENDING
            [00:00:00] Bot #1 created
            [00:00:00] Bot #1 picked up Normal Order #1
            [00:00:05] Bot #1 completed Normal Order #1
            [00:00:05] Bot #1 picked up Normal Order #2
            [00:00:15] Bot #1 completed Normal Order #2
            [00:00:15] Bot #1 is now IDLE
            """
        )
        self.assertFalse(results["r4_bot_processing"].passed)
        self.assertEqual(len(results["r4_bot_processing"].violations), 1)

    def test_new_bot_that_leaves_pending_order_waiting_fails(self):
        log = GOOD_LOG.replace(
            "[00:00:12] Bot #3 picked up Normal Order #1", "[00:00:15] Bot #3 picked up Normal Order #1"
        ).replace("[00:00:22] Bot #3 completed Normal Order #1", "[00:00:25] Bot #3 completed Normal Order #1")
        self.assertFalse(results_for(log)["r4_bot_processing"].passed)

    def test_bot_that_does_not_move_on_to_next_pending_order_fails(self):
        results = results_for(
            """\
            [00:00:00] Created Normal Order #1 - Status: PENDING
            [00:00:00] Created Normal Order #2 - Status: PENDING
            [00:00:00] Bot #1 created
            [00:00:00] Bot #1 picked up Normal Order #1
            [00:00:10] Bot #1 completed Normal Order #1
            [00:00:14] Bot #1 picked up Normal Order #2
            [00:00:24] Bot #1 completed Normal Order #2
            """
        )
        self.assertFalse(results["r4_bot_processing"].passed)

    def test_completing_an_order_the_bot_never_picked_fails(self):
        log = GOOD_LOG.replace(
            "[00:00:31] Bot #1 completed Normal Order #2", "[00:00:31] Bot #1 completed Normal Order #5"
        )
        self.assertFalse(results_for(log)["r4_bot_processing"].passed)


class IdleBots(unittest.TestCase):
    def test_bot_that_never_reports_idle_fails(self):
        log = GOOD_LOG.replace("[00:00:22] Bot #3 is now IDLE - No pending orders\n", "")
        self.assertFalse(results_for(log)["r5_idle_bot"].passed)

    def test_idle_bot_that_ignores_a_new_order_fails(self):
        log = GOOD_LOG.replace(
            "[00:00:23] Bot #3 picked up Normal Order #5", "[00:00:26] Bot #3 picked up Normal Order #5"
        ).replace("[00:00:33] Bot #3 completed Normal Order #5", "[00:00:36] Bot #3 completed Normal Order #5")
        results = results_for(log)
        self.assertFalse(results["r5_idle_bot"].passed)
        self.assertTrue(results["r4_bot_processing"].passed, results["r4_bot_processing"].violations)

    def test_run_where_no_order_arrives_for_an_idle_bot_is_not_exercised(self):
        results = results_for(
            """\
            [00:00:00] Created Normal Order #1 - Status: PENDING
            [00:00:00] Bot #1 created
            [00:00:00] Bot #1 picked up Normal Order #1
            [00:00:10] Bot #1 completed Normal Order #1
            [00:00:10] Bot #1 is now IDLE
            """
        )
        self.assertFalse(results["r5_idle_bot"].exercised)


class IdleReport(unittest.TestCase):
    def test_late_idle_report_before_next_pickup_passes(self):
        results = results_for(
            """\
            [00:00:00] Created Normal Order #1 - Status: PENDING
            [00:00:00] Bot #1 created
            [00:00:00] Bot #1 picked up Normal Order #1
            [00:00:10] Bot #1 completed Normal Order #1
            [00:00:13] Bot #1 is now IDLE
            [00:00:20] Created Normal Order #2 - Status: PENDING
            [00:00:20] Bot #1 picked up Normal Order #2
            """
        )
        self.assertEqual(results["r5_idle_bot"].violations, [])


class RemoveBot(unittest.TestCase):
    def test_removing_an_older_bot_fails(self):
        log = GOOD_LOG.replace(
            "[00:00:02] Bot #2 destroyed while PROCESSING - Normal Order #1 returned to PENDING",
            "[00:00:02] Bot #1 destroyed while PROCESSING - VIP Order #3 returned to PENDING",
        )
        self.assertFalse(results_for(log)["r6_remove_newest_bot"].passed)

    def test_removing_an_older_busy_bot_fails(self):
        results = results_for(
            """\
            [00:00:00] Created Normal Order #1 - Status: PENDING
            [00:00:00] Created Normal Order #2 - Status: PENDING
            [00:00:00] Created Normal Order #3 - Status: PENDING
            [00:00:01] Bot #1 created
            [00:00:01] Bot #1 picked up Normal Order #1
            [00:00:01] Bot #2 created
            [00:00:01] Bot #2 picked up Normal Order #2
            [00:00:02] Bot #1 destroyed - Normal Order #1 returned to PENDING
            [00:00:11] Bot #2 completed Normal Order #2
            [00:00:11] Bot #2 picked up Normal Order #1
            [00:00:21] Bot #2 completed Normal Order #1
            [00:00:21] Bot #2 picked up Normal Order #3
            """
        )
        self.assertTrue(results["r6_remove_newest_bot"].exercised)
        self.assertFalse(results["r6_remove_newest_bot"].passed)

    def test_returned_order_losing_its_place_fails(self):
        log = GOOD_LOG.replace(
            "[00:00:12] Bot #3 picked up Normal Order #1", "[00:00:12] Bot #3 picked up Normal Order #2"
        ).replace(
            "[00:00:21] Bot #1 picked up Normal Order #2", "[00:00:21] Bot #1 picked up Normal Order #1"
        ).replace(
            "[00:00:22] Bot #3 completed Normal Order #1", "[00:00:22] Bot #3 completed Normal Order #2"
        ).replace(
            "[00:00:31] Bot #1 completed Normal Order #2", "[00:00:31] Bot #1 completed Normal Order #1"
        )
        results = results_for(log)
        self.assertFalse(results["r6_remove_newest_bot"].passed)
        self.assertTrue(results["r2_vip_priority"].passed, results["r2_vip_priority"].violations)

    def test_removed_bot_that_still_completes_its_order_fails(self):
        log = GOOD_LOG.replace(
            "[00:00:12] Bot #3 created - Status: ACTIVE\n",
            "[00:00:11] Bot #2 completed Normal Order #1\n[00:00:12] Bot #3 created - Status: ACTIVE\n",
        )
        self.assertFalse(results_for(log)["r6_remove_newest_bot"].passed)

    def test_run_that_only_removes_idle_bots_is_not_exercised(self):
        results = results_for(
            """\
            [00:00:00] Bot #1 created
            [00:00:01] Bot #1 destroyed while IDLE
            """
        )
        self.assertFalse(results["r6_remove_newest_bot"].exercised)


def write_solution(root, run_body, test_body="true", build_body="true"):
    scripts = root / "scripts"
    scripts.mkdir(parents=True)
    for name, body in [("test.sh", test_body), ("build.sh", build_body), ("run.sh", run_body)]:
        path = scripts / name
        path.write_text("#!/bin/bash\nset -e\n" + body + "\n")
        path.chmod(0o755)


class EndToEnd(unittest.TestCase):
    def setUp(self):
        self.tmp = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)
        (self.tmp / "good.log").write_text(GOOD_LOG)

    def run_checker(self, solution):
        proc = subprocess.run(
            [str(HIDDEN / "run.sh"), str(solution)], capture_output=True, text=True, check=True
        )
        output = json.loads(proc.stdout)
        return {r["id"]: r["passed"] for r in output["results"]}, output["metrics"]

    def test_solution_printing_a_correct_log_passes_every_result(self):
        write_solution(self.tmp / "sol", f"cp {self.tmp / 'good.log'} scripts/result.txt")
        results, metrics = self.run_checker(self.tmp / "sol")
        self.assertEqual(set(results), {"ci_verify", "r7_in_memory", "demonstrates_all", *check.REQUIREMENT_IDS})
        self.assertTrue(all(results.values()), results)
        self.assertGreater(metrics["events_parsed"], 20)

    def test_sample_result_file_left_in_place_is_not_mistaken_for_output(self):
        write_solution(self.tmp / "sol", "echo 'Added 1 bot' > result.txt")
        (self.tmp / "sol" / "scripts" / "result.txt").write_text(GOOD_LOG)
        results, _ = self.run_checker(self.tmp / "sol")
        self.assertFalse(results["ci_verify"])
        self.assertFalse(results["r1_normal_order_flow"])

    def test_failing_unit_tests_fail_ci_verify(self):
        write_solution(
            self.tmp / "sol", f"cp {self.tmp / 'good.log'} scripts/result.txt", test_body="exit 1"
        )
        results, _ = self.run_checker(self.tmp / "sol")
        self.assertFalse(results["ci_verify"])

    def test_run_that_only_touches_a_file_keeps_in_memory(self):
        write_solution(
            self.tmp / "sol",
            f"touch keep.txt\ncp {self.tmp / 'good.log'} scripts/result.txt",
        )
        (self.tmp / "sol" / "keep.txt").write_text("unchanged")
        results, _ = self.run_checker(self.tmp / "sol")
        self.assertTrue(results["r7_in_memory"])

    def test_run_that_writes_a_state_file_fails_in_memory(self):
        write_solution(
            self.tmp / "sol",
            f"cp {self.tmp / 'good.log'} scripts/result.txt\necho '{{}}' > orders.json",
        )
        results, _ = self.run_checker(self.tmp / "sol")
        self.assertFalse(results["r7_in_memory"])
        self.assertTrue(results["ci_verify"])

    def test_checker_does_not_modify_the_solution_directory(self):
        write_solution(self.tmp / "sol", f"cp {self.tmp / 'good.log'} scripts/result.txt")
        self.run_checker(self.tmp / "sol")
        self.assertFalse((self.tmp / "sol" / "scripts" / "result.txt").exists())


if __name__ == "__main__":
    unittest.main()
