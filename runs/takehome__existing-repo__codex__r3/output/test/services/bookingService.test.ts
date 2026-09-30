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

  it("promotes the first waitlisted member when a booking is cancelled", () => {
    const session = world.seedSession({ capacity: 1 });
    const booking = world.seedBooking(session, world.seedMember());
    const first = world.seedMember();
    const second = world.seedMember();
    expectOk(world.services.waitlist.join(session.id, first.id));
    expectOk(world.services.waitlist.join(session.id, second.id));
    world.clock.advanceMinutes(5);
    expectOk(world.services.bookings.cancel(booking.id));
    expect(world.repos.bookings.findById(booking.id)).toMatchObject({ status: "cancelled" });
    expect(world.repos.bookings.listConfirmedForSession(session.id)).toMatchObject([
      { memberId: first.id, status: "confirmed", createdAt: minutesFromNow(5) },
    ]);
    expect(expectOk(world.services.waitlist.listForSession(session.id))).toMatchObject([
      { position: 1, entry: { memberId: second.id } },
    ]);
  });

  it("keeps a queued member when an overlapping booking prevents promotion", () => {
    const session = world.seedSession({ capacity: 1, startsAt: minutesFromNow(60) });
    const booking = world.seedBooking(session, world.seedMember());
    const queued = world.seedMember();
    expectOk(world.services.waitlist.join(session.id, queued.id));
    const overlapping = world.seedSession({ startsAt: minutesFromNow(90) });
    expectOk(world.services.bookings.book(overlapping.id, queued.id));
    expectOk(world.services.bookings.cancel(booking.id));
    expect(world.repos.bookings.countConfirmedForSession(session.id)).toBe(0);
    expect(expectOk(world.services.waitlist.listForSession(session.id))).toMatchObject([
      { position: 1, entry: { memberId: queued.id } },
    ]);
  });
});

describe("BookingService.book with a waitlist", () => {
  it("removes a queued member who books after capacity increases", () => {
    const world = makeWorld();
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const member = world.seedMember();
    expectOk(world.services.waitlist.join(session.id, member.id));
    expectOk(world.services.sessions.changeCapacity(session.id, 2));
    expectOk(world.services.bookings.book(session.id, member.id));
    expect(expectOk(world.services.waitlist.listForSession(session.id))).toEqual([]);
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
