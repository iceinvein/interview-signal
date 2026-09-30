import { beforeEach, describe, expect, it } from "vitest";
import { errorCode, makeTestApp } from "../fixtures.ts";

describe("session waitlists over HTTP", () => {
  let request: ReturnType<typeof makeTestApp>["request"];

  beforeEach(() => {
    request = makeTestApp().request;
    request("POST", "/sessions", {
      title: "Pilates",
      instructor: "Priya",
      startsAt: "2026-03-02T12:00:00Z",
      durationMinutes: 60,
      capacity: 1,
    });
    request("POST", "/members", { name: "Ada", email: "ada@example.com" });
    request("POST", "/members", { name: "Grace", email: "grace@example.com" });
    request("POST", "/members", { name: "Lin", email: "lin@example.com" });
  });

  it("answers 201 with the position and join time", () => {
    request("POST", "/sessions/ses_1/bookings", { memberId: "mem_1" });
    const response = request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" });
    expect(response).toEqual({
      status: 201,
      body: { sessionId: "ses_1", memberId: "mem_2", position: 1, joinedAt: "2026-03-02T09:00:00.000Z" },
    });
  });

  it("answers 409 session_not_full when a place is available", () => {
    const response = request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" });
    expect(response.status).toBe(409);
    expect(errorCode(response)).toBe("session_not_full");
  });

  it("answers 204 and closes the queue gap when a member leaves", () => {
    request("POST", "/sessions/ses_1/bookings", { memberId: "mem_1" });
    request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" });
    request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_3" });
    const removed = request("DELETE", "/sessions/ses_1/waitlist/mem_2");
    expect(removed.status).toBe(204);
    expect(removed.body).toBeUndefined();
    expect(request("GET", "/sessions/ses_1/waitlist").body).toEqual({
      waitlist: [{ position: 1, memberId: "mem_3", name: "Lin" }],
    });
  });

  it("answers 404 when deleting a member who is not waitlisted", () => {
    expect(request("DELETE", "/sessions/ses_1/waitlist/mem_2").status).toBe(404);
  });

  it("shows the promoted booking after a cancellation", () => {
    request("POST", "/sessions/ses_1/bookings", { memberId: "mem_1" });
    request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" });
    request("DELETE", "/bookings/bkg_1");
    expect(request("GET", "/sessions/ses_1/bookings").body).toMatchObject({
      bookings: [{ memberId: "mem_2", status: "confirmed" }],
    });
    expect(request("GET", "/sessions/ses_1/waitlist").body).toEqual({ waitlist: [] });
  });
});
