import { beforeEach, describe, expect, it } from "vitest";
import { errorCode, makeTestApp } from "../fixtures.ts";

describe("session waitlists over HTTP", () => {
  let request: ReturnType<typeof makeTestApp>["request"];

  beforeEach(() => {
    request = makeTestApp().request;
    request("POST", "/sessions", {
      title: "Pilates", instructor: "Priya", startsAt: "2026-03-02T12:00:00Z", durationMinutes: 60, capacity: 1,
    });
    request("POST", "/members", { name: "Ada", email: "ada@example.com" });
    request("POST", "/members", { name: "Grace", email: "grace@example.com" });
    request("POST", "/members", { name: "Lin", email: "lin@example.com" });
    request("POST", "/sessions/ses_1/bookings", { memberId: "mem_1" });
  });

  it("adds a member with a position and ISO join time", () => {
    expect(request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" })).toEqual({
      status: 201,
      body: { sessionId: "ses_1", memberId: "mem_2", position: 1, joinedAt: "2026-03-02T09:00:00.000Z" },
    });
  });

  it("lists the queue in order with the members' contact details", () => {
    request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" });
    request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_3" });
    expect(request("GET", "/sessions/ses_1/waitlist")).toEqual({
      status: 200,
      body: { waitlist: [
        { position: 1, memberId: "mem_2", name: "Grace", email: "grace@example.com" },
        { position: 2, memberId: "mem_3", name: "Lin", email: "lin@example.com" },
      ] },
    });
  });

  it("removes a member with 204 and updates the remaining position", () => {
    request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" });
    request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_3" });
    expect(request("DELETE", "/sessions/ses_1/waitlist/mem_2")).toEqual({ status: 204 });
    expect(request("GET", "/sessions/ses_1/waitlist").body).toEqual({
      waitlist: [{ position: 1, memberId: "mem_3", name: "Lin", email: "lin@example.com" }],
    });
  });

  it("promotes the first member when a booking is cancelled", () => {
    request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" });
    expect(request("DELETE", "/bookings/bkg_1").status).toBe(200);
    expect(request("GET", "/sessions/ses_1/waitlist").body).toEqual({ waitlist: [] });
    expect(request("GET", "/sessions/ses_1/bookings").body).toMatchObject({
      bookings: [{ memberId: "mem_2", status: "confirmed" }],
    });
  });

  it("maps duplicate waitlist joins to a 409 conflict", () => {
    request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" });
    const response = request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" });
    expect(response.status).toBe(409);
    expect(errorCode(response)).toBe("already_waitlisted");
  });

  it("answers 404 when removing a member who is not waiting", () => {
    expect(request("DELETE", "/sessions/ses_1/waitlist/mem_2").status).toBe(404);
  });

  it("answers 404 when listing an unknown session", () => {
    expect(request("GET", "/sessions/ses_missing/waitlist").status).toBe(404);
  });

  it("answers 400 when the join body has no memberId", () => {
    const response = request("POST", "/sessions/ses_1/waitlist", {});
    expect(response.status).toBe(400);
    expect(errorCode(response)).toBe("validation");
  });
});
