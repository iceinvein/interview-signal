import { describe, expect, it } from "vitest";
import { describeEvent, timestamp } from "../src/format.js";

describe("timestamp", () => {
  it("prints local time as zero-padded HH:MM:SS", () => {
    expect(timestamp(new Date(2026, 0, 1, 9, 5, 3))).toBe("09:05:03");
  });
});

describe("describeEvent", () => {
  it("describes a VIP order entering PENDING", () => {
    expect(describeEvent({ kind: "orderCreated", order: { id: 3, type: "VIP" } })).toBe(
      "Created VIP Order #3 - Status: PENDING",
    );
  });

  it("describes a completion with its processing time", () => {
    expect(
      describeEvent({ kind: "orderCompleted", botId: 1, order: { id: 2, type: "NORMAL" }, processingMs: 10_000 }),
    ).toBe("Bot #1 completed Normal Order #2 - Status: COMPLETE (Processing time: 10s)");
  });

  it("describes removing a busy bot and where its order went", () => {
    expect(describeEvent({ kind: "botRemoved", botId: 2, returnedOrder: { id: 1, type: "NORMAL" } })).toBe(
      "Bot #2 destroyed while PROCESSING - Normal Order #1 returned to PENDING",
    );
  });
});
