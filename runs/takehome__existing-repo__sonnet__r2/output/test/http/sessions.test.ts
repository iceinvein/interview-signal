import { describe, expect, it } from "vitest";
import { errorCode, makeTestApp } from "../fixtures.ts";

const spin = {
  title: "Spin",
  instructor: "Tom",
  startsAt: "2026-03-03T18:00:00Z",
  durationMinutes: 45,
  capacity: 2,
};

describe("POST /sessions", () => {
  it("schedules a session with every place free", () => {
    const { request } = makeTestApp();
    const response = request("POST", "/sessions", spin);
    expect(response).toEqual({
      status: 201,
      body: { id: "ses_1", ...spin, startsAt: "2026-03-03T18:00:00.000Z", spotsLeft: 2 },
    });
  });

  it("answers 400 for a timestamp without an offset", () => {
    const { request } = makeTestApp();
    const response = request("POST", "/sessions", { ...spin, startsAt: "2026-03-03T18:00:00" });
    expect(response.body).toMatchObject({ error: { code: "validation", field: "startsAt" } });
  });
});

describe("PATCH /sessions/:sessionId", () => {
  it("answers 409 capacity_below_bookings when shrinking below the bookings", () => {
    const { request } = makeTestApp();
    request("POST", "/sessions", spin);
    for (const email of ["a@example.com", "b@example.com"]) {
      const member = request("POST", "/members", { name: "M", email }).body as { id: string };
      request("POST", "/sessions/ses_1/bookings", { memberId: member.id });
    }
    const response = request("PATCH", "/sessions/ses_1", { capacity: 1 });
    expect(response.status).toBe(409);
    expect(errorCode(response)).toBe("capacity_below_bookings");
  });
});

describe("GET /sessions/:sessionId/bookings", () => {
  it("lists members by id and name only", () => {
    const { request } = makeTestApp();
    request("POST", "/sessions", spin);
    request("POST", "/members", { name: "Ada", email: "ada@example.com" });
    request("POST", "/sessions/ses_1/bookings", { memberId: "mem_1" });
    const response = request("GET", "/sessions/ses_1/bookings");
    expect(response.body).toEqual({
      bookings: [expect.objectContaining({ id: "bkg_1", member: { id: "mem_1", name: "Ada" } })],
    });
  });
});
