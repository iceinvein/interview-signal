import { beforeEach, describe, expect, it } from "vitest";
import { errorCode, makeTestApp } from "../fixtures.ts";

describe("bookings over HTTP", () => {
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
  });

  it("books a place and shows it on the member's bookings", () => {
    const created = request("POST", "/sessions/ses_1/bookings", { memberId: "mem_1" });
    expect(created).toMatchObject({ status: 201, body: { id: "bkg_1", status: "confirmed" } });
    const listed = request("GET", "/members/mem_1/bookings");
    expect(listed.body).toMatchObject({ bookings: [{ id: "bkg_1", session: { id: "ses_1", title: "Pilates" } }] });
  });

  it("answers 409 session_full when no places are left", () => {
    request("POST", "/sessions/ses_1/bookings", { memberId: "mem_1" });
    const response = request("POST", "/sessions/ses_1/bookings", { memberId: "mem_2" });
    expect(response.status).toBe(409);
    expect(errorCode(response)).toBe("session_full");
  });

  it("cancels a booking and frees the place for someone else", () => {
    request("POST", "/sessions/ses_1/bookings", { memberId: "mem_1" });
    const cancelled = request("DELETE", "/bookings/bkg_1");
    expect(cancelled).toMatchObject({ status: 200, body: { status: "cancelled", cancelledAt: "2026-03-02T09:00:00.000Z" } });
    expect(request("POST", "/sessions/ses_1/bookings", { memberId: "mem_2" }).status).toBe(201);
  });

  it("answers 404 when cancelling an unknown booking", () => {
    expect(request("DELETE", "/bookings/bkg_404").status).toBe(404);
  });
});
