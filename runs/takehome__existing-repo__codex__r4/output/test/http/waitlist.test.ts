import { beforeEach, describe, expect, it } from "vitest";
import { errorCode, makeTestApp } from "../fixtures.ts";

describe("waitlist over HTTP", () => {
  let request: ReturnType<typeof makeTestApp>["request"];

  beforeEach(() => {
    request = makeTestApp().request;
    request("POST", "/sessions", {
      title: "Pilates", instructor: "Priya", startsAt: "2026-03-03T12:00:00Z", durationMinutes: 60, capacity: 1,
    });
    for (const [name, email] of [["Ada", "ada@example.com"], ["Grace", "grace@example.com"], ["Lin", "lin@example.com"]]) {
      request("POST", "/members", { name, email });
    }
    request("POST", "/sessions/ses_1/bookings", { memberId: "mem_1" });
  });

  it("joins and lists the queue with member contact details", () => {
    expect(request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" })).toEqual({
      status: 201,
      body: { sessionId: "ses_1", memberId: "mem_2", position: 1, joinedAt: "2026-03-02T09:00:00.000Z" },
    });
    request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_3" });
    expect(request("GET", "/sessions/ses_1/waitlist")).toEqual({
      status: 200,
      body: { waitlist: [
        { position: 1, memberId: "mem_2", name: "Grace", email: "grace@example.com" },
        { position: 2, memberId: "mem_3", name: "Lin", email: "lin@example.com" },
      ] },
    });
  });

  it("removes a member with 204 and compacts the queue", () => {
    request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" });
    request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_3" });
    expect(request("DELETE", "/sessions/ses_1/waitlist/mem_2")).toEqual({ status: 204 });
    expect(request("GET", "/sessions/ses_1/waitlist").body).toEqual({
      waitlist: [{ position: 1, memberId: "mem_3", name: "Lin", email: "lin@example.com" }],
    });
  });

  it("answers 404 when removing a member who is not waiting", () => {
    expect(request("DELETE", "/sessions/ses_1/waitlist/mem_2").status).toBe(404);
  });

  it("answers 409 already_waitlisted for a duplicate join", () => {
    request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" });
    const response = request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" });
    expect(response.status).toBe(409);
    expect(errorCode(response)).toBe("already_waitlisted");
  });

  it("promotes the first waiter when a booking is cancelled", () => {
    request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" });
    expect(request("DELETE", "/bookings/bkg_1").status).toBe(200);
    expect(request("GET", "/sessions/ses_1/waitlist").body).toEqual({ waitlist: [] });
    expect(request("GET", "/members/mem_2/bookings").body).toMatchObject({
      bookings: [{ sessionId: "ses_1", status: "confirmed" }],
    });
  });
});
