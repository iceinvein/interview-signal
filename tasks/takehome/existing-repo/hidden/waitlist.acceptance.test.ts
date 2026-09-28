// Acceptance suite for the waitlist feature. It talks to the candidate's code
// only through buildApp() and app.handle(), which exist before the task
// starts, so it does not depend on how the feature is structured inside.
// Each test title starts with the result id that hidden/run.sh reports.
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";

const START = new Date("2026-03-02T09:00:00.000Z");

type Json = Record<string, unknown>;
interface Reply {
  status: number;
  body?: unknown;
}

function world() {
  let now = new Date(START);
  const app = buildApp({ clock: { now: () => new Date(now) } });

  function request(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Reply {
    return app.handle(body === undefined ? { method, path } : { method, path, body }) as Reply;
  }

  let emails = 0;
  function member(name: string): string {
    emails += 1;
    const reply = request("POST", "/members", { name, email: `acceptance${emails}@example.com` });
    expect(reply.status).toBe(201);
    return (reply.body as Json).id as string;
  }

  function session(capacity: number, startsAt = "2026-03-02T18:00:00Z"): string {
    const reply = request("POST", "/sessions", {
      title: "Reformer",
      instructor: "Priya",
      startsAt,
      durationMinutes: 60,
      capacity,
    });
    expect(reply.status).toBe(201);
    return (reply.body as Json).id as string;
  }

  function book(sessionId: string, memberId: string): string {
    const reply = request("POST", `/sessions/${sessionId}/bookings`, { memberId });
    expect(reply.status).toBe(201);
    return (reply.body as Json).id as string;
  }

  function join(sessionId: string, memberId: string): Reply {
    return request("POST", `/sessions/${sessionId}/waitlist`, { memberId });
  }

  function waitlist(sessionId: string): Json[] {
    const reply = request("GET", `/sessions/${sessionId}/waitlist`);
    expect(reply.status).toBe(200);
    return (reply.body as { waitlist: Json[] }).waitlist;
  }

  function confirmedMemberIds(sessionId: string): string[] {
    const reply = request("GET", `/sessions/${sessionId}/bookings`);
    expect(reply.status).toBe(200);
    return (reply.body as { bookings: Json[] }).bookings.map((b) => (b.member as Json).id as string);
  }

  function spotsLeft(sessionId: string): number {
    return (request("GET", `/sessions/${sessionId}`).body as Json).spotsLeft as number;
  }

  return {
    request,
    member,
    session,
    book,
    join,
    waitlist,
    confirmedMemberIds,
    spotsLeft,
    advanceMinutes(n: number) {
      now = new Date(now.getTime() + n * 60_000);
    },
  };
}

function errorCode(reply: Reply): unknown {
  return (reply.body as { error?: { code?: unknown } } | undefined)?.error?.code;
}

describe("waitlist acceptance", () => {
  let w: ReturnType<typeof world>;
  let full: string;
  let holder: string;
  let holderBooking: string;

  beforeEach(() => {
    w = world();
    full = w.session(1);
    holder = w.member("Holder");
    holderBooking = w.book(full, holder);
  });

  it("join_returns_position: joining a full session answers 201 with a 1-based position", () => {
    const ada = w.member("Ada");
    const grace = w.member("Grace");
    const first = w.join(full, ada);
    const second = w.join(full, grace);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      sessionId: full,
      memberId: ada,
      position: 1,
      joinedAt: "2026-03-02T09:00:00.000Z",
    });
    expect(second.status).toBe(201);
    expect(second.body).toMatchObject({ memberId: grace, position: 2 });
  });

  it("join_rejects_not_full: joining a session with places answers 409 session_not_full", () => {
    const open = w.session(5);
    const reply = w.join(open, w.member("Ada"));
    expect(reply.status).toBe(409);
    expect(errorCode(reply)).toBe("session_not_full");
  });

  it("join_rejects_already_booked: the member holding a place cannot join the waitlist", () => {
    const reply = w.join(full, holder);
    expect(reply.status).toBe(409);
    expect(errorCode(reply)).toBe("already_booked");
  });

  it("join_rejects_already_waitlisted: joining twice answers 409 already_waitlisted", () => {
    const ada = w.member("Ada");
    expect(w.join(full, ada).status).toBe(201);
    const reply = w.join(full, ada);
    expect(reply.status).toBe(409);
    expect(errorCode(reply)).toBe("already_waitlisted");
    expect(w.waitlist(full)).toHaveLength(1);
  });

  it("join_rejects_started: joining once the session has started answers 409 session_started", () => {
    const ada = w.member("Ada");
    w.advanceMinutes(9 * 60);
    const reply = w.join(full, ada);
    expect(reply.status).toBe(409);
    expect(errorCode(reply)).toBe("session_started");
  });

  it("join_unknown_404: an unknown session or member answers 404", () => {
    const unknownSession = w.join("ses_does_not_exist", w.member("Ada"));
    const unknownMember = w.join(full, "mem_does_not_exist");
    expect([unknownSession.status, errorCode(unknownSession)]).toEqual([404, "not_found"]);
    expect([unknownMember.status, errorCode(unknownMember)]).toEqual([404, "not_found"]);
  });

  it("list_in_queue_order: GET lists entries in join order with position, memberId and name", () => {
    const ada = w.member("Ada");
    const grace = w.member("Grace");
    const linus = w.member("Linus");
    w.join(full, ada);
    w.join(full, grace);
    w.join(full, linus);
    const entries = w.waitlist(full);
    expect(entries.map((e) => [e.position, e.memberId, e.name])).toEqual([
      [1, ada, "Ada"],
      [2, grace, "Grace"],
      [3, linus, "Linus"],
    ]);
  });

  it("leave_moves_queue_up: leaving answers 204 and everyone behind moves up one place", () => {
    const ada = w.member("Ada");
    const grace = w.member("Grace");
    const linus = w.member("Linus");
    w.join(full, ada);
    w.join(full, grace);
    w.join(full, linus);
    const reply = w.request("DELETE", `/sessions/${full}/waitlist/${ada}`);
    expect(reply.status).toBe(204);
    expect(w.waitlist(full).map((e) => [e.position, e.memberId])).toEqual([
      [1, grace],
      [2, linus],
    ]);
  });

  it("leave_not_waitlisted_404: leaving a waitlist the member is not on answers 404", () => {
    const ada = w.member("Ada");
    const reply = w.request("DELETE", `/sessions/${full}/waitlist/${ada}`);
    expect([reply.status, errorCode(reply)]).toEqual([404, "not_found"]);
  });

  it("rejoin_goes_to_back: a member who left and rejoins is placed at the back", () => {
    const ada = w.member("Ada");
    const grace = w.member("Grace");
    w.join(full, ada);
    w.join(full, grace);
    w.request("DELETE", `/sessions/${full}/waitlist/${ada}`);
    expect(w.join(full, ada).body).toMatchObject({ position: 2 });
    expect(w.waitlist(full).map((e) => e.memberId)).toEqual([grace, ada]);
  });

  it("cancel_promotes_front: cancelling a booking gives the place to the front of the waitlist", () => {
    const ada = w.member("Ada");
    const grace = w.member("Grace");
    w.join(full, ada);
    w.join(full, grace);
    const cancelled = w.request("DELETE", `/bookings/${holderBooking}`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({ id: holderBooking, status: "cancelled" });
    expect(w.confirmedMemberIds(full)).toEqual([ada]);
    expect(w.waitlist(full).map((e) => [e.position, e.memberId])).toEqual([[1, grace]]);
  });

  it("promoted_booking_is_normal: the promoted place is a confirmed booking the member can see and cancel", () => {
    const ada = w.member("Ada");
    const grace = w.member("Grace");
    w.join(full, ada);
    w.join(full, grace);
    w.request("DELETE", `/bookings/${holderBooking}`);

    const mine = w.request("GET", `/members/${ada}/bookings`);
    expect(mine.status).toBe(200);
    const bookings = (mine.body as { bookings: Json[] }).bookings;
    expect(bookings).toHaveLength(1);
    expect(bookings[0]).toMatchObject({ sessionId: full, memberId: ada, status: "confirmed" });

    const again = w.request("DELETE", `/bookings/${bookings[0]!.id as string}`);
    expect(again.status).toBe(200);
    expect(w.confirmedMemberIds(full)).toEqual([grace]);
    expect(w.waitlist(full)).toEqual([]);
  });

  it("cancel_empty_waitlist_frees_place: with nobody waiting, a cancellation leaves the place free", () => {
    w.request("DELETE", `/bookings/${holderBooking}`);
    expect(w.spotsLeft(full)).toBe(1);
    expect(w.confirmedMemberIds(full)).toEqual([]);
  });

  it("capacity_never_exceeded: joins, leaves and promotions never overfill the session", () => {
    const pair = w.session(2, "2026-03-03T18:00:00Z");
    const bookingIds = [w.book(pair, w.member("A")), w.book(pair, w.member("B"))];
    const waiting = ["C", "D", "E"].map((name) => w.member(name));
    for (const id of waiting) expect(w.join(pair, id).status).toBe(201);

    for (const id of bookingIds) w.request("DELETE", `/bookings/${id}`);
    expect(w.confirmedMemberIds(pair)).toEqual([waiting[0], waiting[1]]);
    expect(w.spotsLeft(pair)).toBe(0);
    expect(w.waitlist(pair).map((e) => e.memberId)).toEqual([waiting[2]]);

    // The one still waiting cannot jump the queue into a full session.
    const direct = w.request("POST", `/sessions/${pair}/bookings`, { memberId: waiting[2] });
    expect(direct.status).toBe(409);
    expect(w.confirmedMemberIds(pair)).toHaveLength(2);
  });
});
