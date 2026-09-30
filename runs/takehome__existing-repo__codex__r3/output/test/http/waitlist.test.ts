import { beforeEach, describe, expect, it } from "vitest";
import { errorCode, makeTestApp } from "../fixtures.ts";

describe("waitlist over HTTP", () => {
  let request: ReturnType<typeof makeTestApp>["request"];

  beforeEach(() => {
    request = makeTestApp().request;
    request("POST", "/sessions", {
      title: "Pilates", instructor: "Priya", startsAt: "2026-03-02T12:00:00Z", durationMinutes: 60, capacity: 1,
    });
    request("POST", "/members", { name: "Booked", email: "booked@example.com" });
    request("POST", "/members", { name: "Ada", email: "ada@example.com" });
    request("POST", "/members", { name: "Grace", email: "grace@example.com" });
  });

  it("adds a member to a full session and returns their position and join time", () => {
    request("POST", "/sessions/ses_1/bookings", { memberId: "mem_1" });
    expect(request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" })).toEqual({
      status: 201,
      body: { sessionId: "ses_1", memberId: "mem_2", position: 1, joinedAt: "2026-03-02T09:00:00.000Z" },
    });
  });

  it("lists the queue with names and emails in position order", () => {
    request("POST", "/sessions/ses_1/bookings", { memberId: "mem_1" });
    request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" });
    request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_3" });
    expect(request("GET", "/sessions/ses_1/waitlist")).toEqual({
      status: 200,
      body: { waitlist: [
        { position: 1, memberId: "mem_2", name: "Ada", email: "ada@example.com" },
        { position: 2, memberId: "mem_3", name: "Grace", email: "grace@example.com" },
      ] },
    });
  });

  it("removes a member and moves the next one to the front", () => {
    request("POST", "/sessions/ses_1/bookings", { memberId: "mem_1" });
    request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" });
    request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_3" });
    expect(request("DELETE", "/sessions/ses_1/waitlist/mem_2")).toEqual({ status: 204, body: undefined });
    expect(request("GET", "/sessions/ses_1/waitlist").body).toEqual({
      waitlist: [{ position: 1, memberId: "mem_3", name: "Grace", email: "grace@example.com" }],
    });
  });

  it("answers 409 when the session is not full", () => {
    const response = request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" });
    expect(response.status).toBe(409);
    expect(errorCode(response)).toBe("session_not_full");
  });

  it("answers 404 when removing a member who is not waitlisted", () => {
    expect(request("DELETE", "/sessions/ses_1/waitlist/mem_2").status).toBe(404);
  });

  it("promotes the front member to a confirmed booking after cancellation", () => {
    request("POST", "/sessions/ses_1/bookings", { memberId: "mem_1" });
    request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" });
    expect(request("DELETE", "/bookings/bkg_1").status).toBe(200);
    expect(request("GET", "/sessions/ses_1/waitlist").body).toEqual({ waitlist: [] });
    expect(request("GET", "/members/mem_2/bookings").body).toMatchObject({
      bookings: [{ id: "bkg_2", status: "confirmed", sessionId: "ses_1" }],
    });
  });
});
