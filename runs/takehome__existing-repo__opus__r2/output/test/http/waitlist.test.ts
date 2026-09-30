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
    request("POST", "/members", { name: "Hedy", email: "hedy@example.com" });
    request("POST", "/sessions/ses_1/bookings", { memberId: "mem_1" });
  });

  it("joins the waitlist of a full session", () => {
    const response = request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" });
    expect(response).toEqual({
      status: 201,
      body: { sessionId: "ses_1", memberId: "mem_2", position: 1, joinedAt: "2026-03-02T09:00:00.000Z" },
    });
  });

  it("answers 409 session_not_full when a place is free", () => {
    request("DELETE", "/bookings/bkg_1");
    const response = request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" });
    expect(response.status).toBe(409);
    expect(errorCode(response)).toBe("session_not_full");
  });

  it("lists the waitlist in order with members by id and name only", () => {
    request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" });
    request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_3" });
    const response = request("GET", "/sessions/ses_1/waitlist");
    expect(response).toEqual({
      status: 200,
      body: {
        waitlist: [
          expect.objectContaining({ position: 1, memberId: "mem_2", member: { id: "mem_2", name: "Grace" } }),
          expect.objectContaining({ position: 2, memberId: "mem_3", member: { id: "mem_3", name: "Hedy" } }),
        ],
      },
    });
  });

  it("leaves the waitlist with 204", () => {
    request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" });
    expect(request("DELETE", "/sessions/ses_1/waitlist/mem_2")).toEqual({ status: 204 });
    expect(request("GET", "/sessions/ses_1/waitlist").body).toEqual({ waitlist: [] });
  });

  it("answers 404 when leaving a waitlist the member is not on", () => {
    expect(request("DELETE", "/sessions/ses_1/waitlist/mem_2").status).toBe(404);
  });

  it("books the front of the waitlist when a place is cancelled", () => {
    request("POST", "/sessions/ses_1/waitlist", { memberId: "mem_2" });
    request("DELETE", "/bookings/bkg_1");
    expect(request("GET", "/members/mem_2/bookings").body).toMatchObject({ bookings: [{ id: "bkg_2", status: "confirmed" }] });
    expect(request("GET", "/sessions/ses_1/waitlist").body).toEqual({ waitlist: [] });
  });
});
