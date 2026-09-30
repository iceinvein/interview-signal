import { beforeEach, describe, expect, it } from "vitest";
import { errorCode, makeTestApp } from "../fixtures.ts";

describe("waitlist over HTTP", () => {
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
    request("POST", "/members", { name: "Linus", email: "linus@example.com" });
    request("POST", "/sessions/ses_1/bookings", { memberId: "mem_1" });
  });

  it("joins the waitlist of a full session", () => {
    const response = request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" });
    expect(response).toMatchObject({
      status: 201,
      body: { sessionId: "ses_1", memberId: "mem_2", position: 1, joinedAt: "2026-03-02T09:00:00.000Z" },
    });
  });

  it("answers 409 session_not_full while places remain", () => {
    request("DELETE", "/bookings/bkg_1");
    const response = request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" });
    expect(response.status).toBe(409);
    expect(errorCode(response)).toBe("session_not_full");
  });

  it("answers 404 for an unknown session", () => {
    expect(request("POST", "/sessions/ses_9/waitlist", { memberId: "mem_2" }).status).toBe(404);
  });

  it("lists the queue with names and no contact details", () => {
    request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" });
    request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_3" });
    const response = request("GET", "/sessions/ses_1/waitlist");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      waitlist: [
        { position: 1, memberId: "mem_2", name: "Grace" },
        { position: 2, memberId: "mem_3", name: "Linus" },
      ],
    });
  });

  it("removes a member with 204 and answers 404 when they are not listed", () => {
    request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" });
    expect(request("DELETE", "/sessions/ses_1/waitlist/mem_2")).toEqual({ status: 204 });
    expect(request("DELETE", "/sessions/ses_1/waitlist/mem_2").status).toBe(404);
  });

  it("books the front of the waitlist when a booking is cancelled", () => {
    request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" });
    request("DELETE", "/bookings/bkg_1");
    expect(request("GET", "/members/mem_2/bookings").body).toMatchObject({
      bookings: [{ sessionId: "ses_1", status: "confirmed" }],
    });
    expect(request("GET", "/sessions/ses_1/waitlist").body).toEqual({ waitlist: [] });
  });
});
