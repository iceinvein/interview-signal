import { beforeEach, describe, expect, it } from "vitest";
import { expectErr, expectOk, FIXED_NOW, makeWorld, minutesFromNow, type World } from "../fixtures.ts";

describe("WaitlistService.join", () => {
  let world: World;
  beforeEach(() => {
    world = makeWorld();
  });

  it("adds members to the end of a full session's queue", () => {
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const first = world.seedMember();
    const second = world.seedMember();
    expect(expectOk(world.services.waitlist.join(session.id, first.id))).toEqual({
      entry: { sessionId: session.id, memberId: first.id, joinedAt: FIXED_NOW }, position: 1,
    });
    world.clock.advanceMinutes(5);
    expect(expectOk(world.services.waitlist.join(session.id, second.id))).toEqual({
      entry: { sessionId: session.id, memberId: second.id, joinedAt: minutesFromNow(5) }, position: 2,
    });
  });

  it("rejects joining when the session still has room", () => {
    const session = world.seedSession({ capacity: 1 });
    expectErr(world.services.waitlist.join(session.id, world.seedMember().id), "conflict", "session_not_full");
  });

  it("reports already_booked before checking whether the session is full", () => {
    const session = world.seedSession({ capacity: 1 });
    const member = world.seedMember();
    world.seedBooking(session, member);
    expectErr(world.services.waitlist.join(session.id, member.id), "conflict", "already_booked");
  });

  it("rejects a duplicate waitlist entry", () => {
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const member = world.seedMember();
    expectOk(world.services.waitlist.join(session.id, member.id));
    expectErr(world.services.waitlist.join(session.id, member.id), "conflict", "already_waitlisted");
    expect(expectOk(world.services.waitlist.list(session.id))).toHaveLength(1);
  });

  it("rejects joining after the session starts", () => {
    const session = world.seedSession({ capacity: 1, startsAt: minutesFromNow(30) });
    world.fill(session);
    world.clock.advanceMinutes(30);
    expectErr(world.services.waitlist.join(session.id, world.seedMember().id), "conflict", "session_started");
  });

  it("returns not_found for unknown members and sessions", () => {
    const session = world.seedSession();
    const member = world.seedMember();
    expect(expectErr(world.services.waitlist.join(session.id, "mem_missing"), "not_found")).toMatchObject({ entity: "member" });
    expect(expectErr(world.services.waitlist.join("ses_missing", member.id), "not_found")).toMatchObject({ entity: "session" });
  });
});

describe("WaitlistService.leave and list", () => {
  it("removes a member and moves everyone behind them forward", () => {
    const world = makeWorld();
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const members = [world.seedMember(), world.seedMember(), world.seedMember()];
    for (const member of members) expectOk(world.services.waitlist.join(session.id, member.id));
    expectOk(world.services.waitlist.leave(session.id, members[1]!.id));
    expect(expectOk(world.services.waitlist.list(session.id)).map(({ position, entry }) => ({ position, memberId: entry.memberId }))).toEqual([
      { position: 1, memberId: members[0]!.id }, { position: 2, memberId: members[2]!.id },
    ]);
  });

  it("lists queue order with names and email addresses", () => {
    const world = makeWorld();
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const first = world.seedMember({ name: "Ada", email: "ada@example.com" });
    const second = world.seedMember({ name: "Grace", email: "grace@example.com" });
    expectOk(world.services.waitlist.join(session.id, first.id));
    expectOk(world.services.waitlist.join(session.id, second.id));
    expect(expectOk(world.services.waitlist.list(session.id))).toEqual([
      { position: 1, entry: { sessionId: session.id, memberId: first.id, joinedAt: FIXED_NOW }, member: first },
      { position: 2, entry: { sessionId: session.id, memberId: second.id, joinedAt: FIXED_NOW }, member: second },
    ]);
  });

  it("returns not_found for a missing waitlist entry or session", () => {
    const world = makeWorld();
    const session = world.seedSession();
    expectErr(world.services.waitlist.leave(session.id, "mem_missing"), "not_found");
    expectErr(world.services.waitlist.leave("ses_missing", "mem_missing"), "not_found");
    expectErr(world.services.waitlist.list("ses_missing"), "not_found");
  });
});

describe("BookingService.cancel waitlist promotion", () => {
  it("gives the freed place to the front member and keeps the cancelled booking", () => {
    const world = makeWorld();
    const session = world.seedSession({ capacity: 1 });
    const booked = world.seedBooking(session, world.seedMember());
    const first = world.seedMember();
    const second = world.seedMember();
    expectOk(world.services.waitlist.join(session.id, first.id));
    expectOk(world.services.waitlist.join(session.id, second.id));
    world.clock.advanceMinutes(5);
    expectOk(world.services.bookings.cancel(booked.id));
    expect(world.repos.bookings.findById(booked.id)).toMatchObject({ status: "cancelled", cancelledAt: minutesFromNow(5) });
    expect(expectOk(world.services.bookings.listForSession(session.id)).map(({ booking }) => booking)).toEqual([
      expect.objectContaining({ memberId: first.id, status: "confirmed", createdAt: minutesFromNow(5) }),
    ]);
    expect(expectOk(world.services.waitlist.list(session.id)).map(({ position, entry }) => ({ position, memberId: entry.memberId }))).toEqual([
      { position: 1, memberId: second.id },
    ]);
    expect(expectOk(world.services.sessions.get(session.id)).spotsLeft).toBe(0);
  });

  it("promotes the next member after another cancellation", () => {
    const world = makeWorld();
    const session = world.seedSession({ capacity: 1 });
    const booked = world.seedBooking(session, world.seedMember());
    const first = world.seedMember();
    const second = world.seedMember();
    expectOk(world.services.waitlist.join(session.id, first.id));
    expectOk(world.services.waitlist.join(session.id, second.id));
    expectOk(world.services.bookings.cancel(booked.id));
    const promoted = expectOk(world.services.bookings.listForSession(session.id))[0]!.booking;
    expectOk(world.services.bookings.cancel(promoted.id));
    expect(expectOk(world.services.bookings.listForSession(session.id))[0]!.booking.memberId).toBe(second.id);
    expect(expectOk(world.services.waitlist.list(session.id))).toEqual([]);
  });

  it("removes a waitlisted member who books after capacity increases", () => {
    const world = makeWorld();
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const member = world.seedMember();
    expectOk(world.services.waitlist.join(session.id, member.id));
    expectOk(world.services.sessions.changeCapacity(session.id, 2));
    expectOk(world.services.bookings.book(session.id, member.id));
    expect(expectOk(world.services.waitlist.list(session.id))).toEqual([]);
  });

  it("keeps the front member queued if a later booking makes promotion ineligible", () => {
    const world = makeWorld();
    const session = world.seedSession({ capacity: 1, startsAt: minutesFromNow(120) });
    const booked = world.seedBooking(session, world.seedMember());
    const waiting = world.seedMember();
    expectOk(world.services.waitlist.join(session.id, waiting.id));
    world.seedBooking(world.seedSession({ startsAt: minutesFromNow(130) }), waiting);
    expectOk(world.services.bookings.cancel(booked.id));
    expect(expectOk(world.services.bookings.listForSession(session.id))).toEqual([]);
    expect(expectOk(world.services.waitlist.list(session.id))[0]!.member.id).toBe(waiting.id);
  });
});
