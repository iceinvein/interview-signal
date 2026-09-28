import { beforeEach, describe, expect, it } from "vitest";
import { errorCode, makeTestApp } from "../fixtures.ts";

describe("waitlist over HTTP", () => {
  let request: ReturnType<typeof makeTestApp>["request"];

  beforeEach(() => {
    request = makeTestApp().request;
    request("POST", "/sessions", {
      title: "Reformer",
      instructor: "Priya",
      startsAt: "2026-03-02T18:00:00Z",
      durationMinutes: 60,
      capacity: 1,
    });
    request("POST", "/members", { name: "Ada", email: "ada@example.com" });
    request("POST", "/members", { name: "Grace", email: "grace@example.com" });
    request("POST", "/sessions/ses_1/bookings", { memberId: "mem_1" });
  });

  it("joins a full session's waitlist", () => {
    expect(request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" })).toEqual({
      status: 201,
      body: { sessionId: "ses_1", memberId: "mem_2", position: 1, joinedAt: "2026-03-02T09:00:00.000Z" },
    });
  });

  it("answers 409 already_booked for the member holding the place", () => {
    const response = request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_1" });
    expect(response.status).toBe(409);
    expect(errorCode(response)).toBe("already_booked");
  });

  it("lists the waitlist with member id and name only", () => {
    request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" });
    expect(request("GET", "/sessions/ses_1/waitlist")).toEqual({
      status: 200,
      body: { waitlist: [{ position: 1, memberId: "mem_2", name: "Grace", joinedAt: "2026-03-02T09:00:00.000Z" }] },
    });
  });

  it("leaves the waitlist with 204", () => {
    request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" });
    expect(request("DELETE", "/sessions/ses_1/waitlist/mem_2")).toEqual({ status: 204 });
    expect(request("GET", "/sessions/ses_1/waitlist").body).toEqual({ waitlist: [] });
  });

  it("promotes the waiting member when the booking is cancelled", () => {
    request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" });
    request("DELETE", "/bookings/bkg_1");
    expect(request("GET", "/members/mem_2/bookings").body).toMatchObject({
      bookings: [{ sessionId: "ses_1", status: "confirmed" }],
    });
  });
});
