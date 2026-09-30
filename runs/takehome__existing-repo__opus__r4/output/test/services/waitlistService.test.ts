import { beforeEach, describe, expect, it } from "vitest";
import { expectErr, expectOk, makeWorld, minutesFromNow, type World } from "../fixtures.ts";

describe("WaitlistService.join", () => {
  let world: World;
  beforeEach(() => {
    world = makeWorld();
  });

  it("adds a member to the back of a full session's waitlist", () => {
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    world.seedWaitlist(session, world.seedMember());
    const member = world.seedMember();
    world.clock.advanceMinutes(5);
    const place = expectOk(world.services.waitlist.join(session.id, member.id));
    expect(place).toEqual({
      entry: { sessionId: session.id, memberId: member.id, joinedAt: minutesFromNow(5) },
      position: 2,
    });
  });

  it("rejects joining when the session still has places", () => {
    const session = world.seedSession({ capacity: 2 });
    world.seedBooking(session, world.seedMember());
    expectErr(world.services.waitlist.join(session.id, world.seedMember().id), "conflict", "session_not_full");
  });

  it("rejects a member who already has a place, even when the session is full", () => {
    const session = world.seedSession({ capacity: 1 });
    const member = world.seedMember();
    world.seedBooking(session, member);
    expectErr(world.services.waitlist.join(session.id, member.id), "conflict", "already_booked");
  });

  it("rejects a member who is already on the waitlist", () => {
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const member = world.seedMember();
    world.seedWaitlist(session, member);
    expectErr(world.services.waitlist.join(session.id, member.id), "conflict", "already_waitlisted");
  });

  it("rejects joining once the session has started", () => {
    const session = world.seedSession({ capacity: 1, startsAt: minutesFromNow(-10) });
    world.fill(session);
    expectErr(world.services.waitlist.join(session.id, world.seedMember().id), "conflict", "session_started");
  });

  it("returns not_found for an unknown member or session", () => {
    const session = world.seedSession();
    const member = world.seedMember();
    expect(expectErr(world.services.waitlist.join(session.id, "mem_x"), "not_found")).toMatchObject({
      entity: "member",
    });
    expect(expectErr(world.services.waitlist.join("ses_x", member.id), "not_found")).toMatchObject({
      entity: "session",
    });
  });
});

describe("WaitlistService.leave", () => {
  let world: World;
  beforeEach(() => {
    world = makeWorld();
  });

  it("removes the member and moves everyone behind them up one place", () => {
    const session = world.seedSession();
    const [first, second, third] = [world.seedMember(), world.seedMember(), world.seedMember()];
    world.seedWaitlist(session, first!);
    world.seedWaitlist(session, second!);
    world.seedWaitlist(session, third!);
    expectOk(world.services.waitlist.leave(session.id, second!.id));
    const rows = expectOk(world.services.waitlist.listForSession(session.id));
    expect(rows.map((row) => [row.position, row.member.id])).toEqual([
      [1, first!.id],
      [2, third!.id],
    ]);
  });

  it("returns not_found for a member who is not on the waitlist", () => {
    const session = world.seedSession();
    expect(expectErr(world.services.waitlist.leave(session.id, world.seedMember().id), "not_found")).toMatchObject({
      entity: "waitlist_entry",
    });
  });
});

describe("WaitlistService.listForSession", () => {
  it("lists waiting members in queue order with member summaries", () => {
    const world = makeWorld();
    const session = world.seedSession();
    const ada = world.seedMember({ name: "Ada" });
    const grace = world.seedMember({ name: "Grace" });
    world.seedWaitlist(session, ada);
    world.seedWaitlist(session, grace);
    const rows = expectOk(world.services.waitlist.listForSession(session.id));
    expect(rows.map((row) => ({ position: row.position, member: row.member }))).toEqual([
      { position: 1, member: { id: ada.id, name: "Ada" } },
      { position: 2, member: { id: grace.id, name: "Grace" } },
    ]);
  });

  it("returns not_found for an unknown session", () => {
    const world = makeWorld();
    expectErr(world.services.waitlist.listForSession("ses_x"), "not_found");
  });
});

describe("BookingService.cancel with a waitlist", () => {
  let world: World;
  beforeEach(() => {
    world = makeWorld();
  });

  it("gives the freed place to the member at the front of the waitlist", () => {
    const session = world.seedSession({ capacity: 1 });
    const booking = world.seedBooking(session, world.seedMember());
    const front = world.seedMember();
    world.seedWaitlist(session, front);
    world.seedWaitlist(session, world.seedMember());
    expectOk(world.services.bookings.cancel(booking.id));
    const confirmed = world.repos.bookings.listConfirmedForSession(session.id);
    expect(confirmed.map((b) => b.memberId)).toEqual([front.id]);
  });

  it("removes the promoted member from the waitlist and moves the rest up", () => {
    const session = world.seedSession({ capacity: 1 });
    const booking = world.seedBooking(session, world.seedMember());
    const next = world.seedMember();
    world.seedWaitlist(session, world.seedMember());
    world.seedWaitlist(session, next);
    expectOk(world.services.bookings.cancel(booking.id));
    const rows = expectOk(world.services.waitlist.listForSession(session.id));
    expect(rows.map((row) => [row.position, row.member.id])).toEqual([[1, next.id]]);
  });

  it("skips a waiting member the booking rules would refuse, keeping their position", () => {
    const session = world.seedSession({ capacity: 1, startsAt: minutesFromNow(60) });
    const booking = world.seedBooking(session, world.seedMember());
    const clashing = world.seedMember();
    world.seedBooking(world.seedSession({ startsAt: minutesFromNow(90) }), clashing);
    const eligible = world.seedMember();
    world.seedWaitlist(session, clashing);
    world.seedWaitlist(session, eligible);
    expectOk(world.services.bookings.cancel(booking.id));
    expect(world.repos.bookings.listConfirmedForSession(session.id).map((b) => b.memberId)).toEqual([eligible.id]);
    const rows = expectOk(world.services.waitlist.listForSession(session.id));
    expect(rows.map((row) => [row.position, row.member.id])).toEqual([[1, clashing.id]]);
  });

  it("leaves the place free when nobody is waiting", () => {
    const session = world.seedSession({ capacity: 1 });
    const booking = world.seedBooking(session, world.seedMember());
    expectOk(world.services.bookings.cancel(booking.id));
    expect(world.repos.bookings.countConfirmedForSession(session.id)).toBe(0);
  });
});

describe("BookingService.book with a waitlist", () => {
  it("takes the member off the waitlist when they book a place directly", () => {
    const world = makeWorld();
    const session = world.seedSession({ capacity: 1 });
    const member = world.seedMember();
    world.seedWaitlist(session, member);
    expectOk(world.services.bookings.book(session.id, member.id));
    expect(expectOk(world.services.waitlist.listForSession(session.id))).toEqual([]);
  });
});
