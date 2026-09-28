import { beforeEach, describe, expect, it } from "vitest";
import { expectErr, expectOk, FIXED_NOW, makeWorld, minutesFromNow, type World } from "../fixtures.ts";

describe("BookingService.book", () => {
  let world: World;
  beforeEach(() => {
    world = makeWorld();
  });

  it("confirms a place in a session with room", () => {
    const session = world.seedSession();
    const member = world.seedMember();
    const booking = expectOk(world.services.bookings.book(session.id, member.id));
    expect(booking).toMatchObject({ sessionId: session.id, memberId: member.id, status: "confirmed" });
    expect(world.repos.bookings.countConfirmedForSession(session.id)).toBe(1);
  });

  it("rejects a booking when the session is full", () => {
    const session = world.seedSession({ capacity: 2 });
    world.fill(session);
    expectErr(world.services.bookings.book(session.id, world.seedMember().id), "conflict", "session_full");
  });

  it("tells a member who already has a place so, even when the session is full", () => {
    const session = world.seedSession({ capacity: 1 });
    const member = world.seedMember();
    world.seedBooking(session, member);
    expectErr(world.services.bookings.book(session.id, member.id), "conflict", "already_booked");
  });

  it("lets a member rebook after cancelling", () => {
    const session = world.seedSession();
    const member = world.seedMember();
    world.seedBooking(session, member, { status: "cancelled", cancelledAt: FIXED_NOW });
    expectOk(world.services.bookings.book(session.id, member.id));
  });

  it("rejects a booking for a session that has started", () => {
    const session = world.seedSession({ startsAt: minutesFromNow(-10) });
    expectErr(world.services.bookings.book(session.id, world.seedMember().id), "conflict", "session_started");
  });

  it("rejects a booking that overlaps another of the member's sessions", () => {
    const member = world.seedMember();
    world.seedBooking(world.seedSession({ startsAt: minutesFromNow(60), durationMinutes: 60 }), member);
    const clashing = world.seedSession({ startsAt: minutesFromNow(90) });
    expectErr(world.services.bookings.book(clashing.id, member.id), "conflict", "overlapping_booking");
  });

  it("returns not_found for an unknown member or session", () => {
    const session = world.seedSession();
    const member = world.seedMember();
    expect(expectErr(world.services.bookings.book(session.id, "mem_x"), "not_found")).toMatchObject({ entity: "member" });
    expect(expectErr(world.services.bookings.book("ses_x", member.id), "not_found")).toMatchObject({ entity: "session" });
  });
});

describe("BookingService.cancel", () => {
  let world: World;
  beforeEach(() => {
    world = makeWorld();
  });

  it("marks the booking cancelled and frees the place", () => {
    const session = world.seedSession({ capacity: 1 });
    const booking = world.seedBooking(session, world.seedMember());
    world.clock.advanceMinutes(5);
    const cancelled = expectOk(world.services.bookings.cancel(booking.id));
    expect(cancelled).toMatchObject({ status: "cancelled", cancelledAt: minutesFromNow(5) });
    expect(world.repos.bookings.countConfirmedForSession(session.id)).toBe(0);
  });

  it("rejects cancelling twice", () => {
    const booking = world.seedBooking(world.seedSession(), world.seedMember());
    expectOk(world.services.bookings.cancel(booking.id));
    expectErr(world.services.bookings.cancel(booking.id), "conflict", "already_cancelled");
  });

  it("rejects a cancellation once the session has started", () => {
    const session = world.seedSession({ startsAt: minutesFromNow(30) });
    const booking = world.seedBooking(session, world.seedMember());
    world.clock.advanceMinutes(30);
    expectErr(world.services.bookings.cancel(booking.id), "conflict", "session_started");
  });
});

describe("BookingService.listForSession", () => {
  it("lists confirmed bookings oldest first with member summaries", () => {
    const world = makeWorld();
    const session = world.seedSession();
    const first = world.seedMember({ name: "Ada" });
    const second = world.seedMember({ name: "Grace" });
    world.seedBooking(session, first);
    world.seedBooking(session, second);
    world.seedBooking(session, world.seedMember(), { status: "cancelled", cancelledAt: FIXED_NOW });
    const rows = expectOk(world.services.bookings.listForSession(session.id));
    expect(rows.map((row) => row.member)).toEqual([
      { id: first.id, name: "Ada" },
      { id: second.id, name: "Grace" },
    ]);
  });
});

describe("BookingService.listForMember", () => {
  it("lists the member's confirmed bookings by session start", () => {
    const world = makeWorld();
    const member = world.seedMember();
    const later = world.seedSession({ startsAt: minutesFromNow(600) });
    const sooner = world.seedSession({ startsAt: minutesFromNow(120) });
    world.seedBooking(later, member);
    world.seedBooking(sooner, member);
    const rows = expectOk(world.services.bookings.listForMember(member.id));
    expect(rows.map((row) => row.session.id)).toEqual([sooner.id, later.id]);
  });
});

describe("BookingService.cancel with a waitlist", () => {
  let world: World;
  beforeEach(() => {
    world = makeWorld();
  });

  it("gives the freed place to the front of the waitlist", () => {
    const session = world.seedSession({ capacity: 1 });
    const booking = world.seedBooking(session, world.seedMember());
    const [front, behind] = [world.seedMember(), world.seedMember()];
    world.seedWaitlist(session, front!);
    world.seedWaitlist(session, behind!);
    expectOk(world.services.bookings.cancel(booking.id));
    const confirmed = world.repos.bookings.listConfirmedForSession(session.id);
    expect(confirmed.map((b) => b.memberId)).toEqual([front!.id]);
    expect(world.repos.waitlist.listForSession(session.id).map((e) => e.memberId)).toEqual([behind!.id]);
  });

  it("skips a waiting member who is now booked into a clashing session, keeping their place", () => {
    const session = world.seedSession({ capacity: 1, startsAt: minutesFromNow(600) });
    const booking = world.seedBooking(session, world.seedMember());
    const [clashing, next] = [world.seedMember(), world.seedMember()];
    world.seedBooking(world.seedSession({ startsAt: minutesFromNow(630) }), clashing!);
    world.seedWaitlist(session, clashing!);
    world.seedWaitlist(session, next!);
    expectOk(world.services.bookings.cancel(booking.id));
    const confirmed = world.repos.bookings.listConfirmedForSession(session.id);
    expect(confirmed.map((b) => b.memberId)).toEqual([next!.id]);
    expect(world.repos.waitlist.listForSession(session.id).map((e) => e.memberId)).toEqual([clashing!.id]);
  });

  it("leaves the place free when nobody is waiting", () => {
    const session = world.seedSession({ capacity: 1 });
    const booking = world.seedBooking(session, world.seedMember());
    expectOk(world.services.bookings.cancel(booking.id));
    expect(world.repos.bookings.countConfirmedForSession(session.id)).toBe(0);
  });
});
