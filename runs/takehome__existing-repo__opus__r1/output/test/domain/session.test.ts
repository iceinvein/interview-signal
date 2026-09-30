import { describe, expect, it } from "vitest";
import { overlaps, validateNewSession } from "../../src/domain/session.ts";
import { aSession, expectErr, expectOk, FIXED_NOW, minutesFromNow } from "../fixtures.ts";

const valid = {
  title: "Morning flow",
  instructor: "Priya",
  startsAt: minutesFromNow(60),
  durationMinutes: 45,
  capacity: 12,
};

describe("validateNewSession", () => {
  it("trims the title and instructor", () => {
    const session = expectOk(validateNewSession({ ...valid, title: "  Flow ", instructor: " Priya " }, FIXED_NOW));
    expect(session).toMatchObject({ title: "Flow", instructor: "Priya" });
  });

  it("rejects a session that starts now or earlier", () => {
    const error = expectErr(validateNewSession({ ...valid, startsAt: FIXED_NOW }, FIXED_NOW), "validation");
    expect(error).toMatchObject({ field: "startsAt" });
  });

  it("rejects a capacity outside 1 to 50", () => {
    expectErr(validateNewSession({ ...valid, capacity: 0 }, FIXED_NOW), "validation");
    expectErr(validateNewSession({ ...valid, capacity: 51 }, FIXED_NOW), "validation");
  });

  it("rejects a duration shorter than 15 minutes", () => {
    const error = expectErr(validateNewSession({ ...valid, durationMinutes: 10 }, FIXED_NOW), "validation");
    expect(error).toMatchObject({ field: "durationMinutes" });
  });
});

describe("overlaps", () => {
  it("is true when one session starts before the other ends", () => {
    const first = aSession({ startsAt: minutesFromNow(60), durationMinutes: 60 });
    const second = aSession({ startsAt: minutesFromNow(90), durationMinutes: 60 });
    expect(overlaps(first, second)).toBe(true);
    expect(overlaps(second, first)).toBe(true);
  });

  it("is false for back-to-back sessions", () => {
    const first = aSession({ startsAt: minutesFromNow(60), durationMinutes: 60 });
    const second = aSession({ startsAt: minutesFromNow(120), durationMinutes: 60 });
    expect(overlaps(first, second)).toBe(false);
  });
});
