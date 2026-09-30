import { beforeEach, describe, expect, it } from "vitest";
import { expectErr, expectOk, makeWorld, minutesFromNow, type World } from "../fixtures.ts";

describe("WaitlistService.join", () => {
  let world: World;
  beforeEach(() => {
    world = makeWorld();
  });

  it("adds a member to the end of a full session's waitlist", () => {
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const first = expectOk(world.services.waitlist.join(session.id, world.seedMember().id));
    const second = expectOk(world.services.waitlist.join(session.id, world.seedMember().id));
    expect([first.position, second.position]).toEqual([1, 2]);
  });

  it("rejects joining a session that still has places", () => {
    const session = world.seedSession({ capacity: 2 });
    expectErr(world.services.waitlist.join(session.id, world.seedMember().id), "conflict", "session_not_full");
  });

  it("rejects a member who already has a place", () => {
    const session = world.seedSession({ capacity: 1 });
    const member = world.seedMember();
    world.seedBooking(session, member);
    expectErr(world.services.waitlist.join(session.id, member.id), "conflict", "already_booked");
  });

  it("rejects a member who is already waitlisted", () => {
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const member = world.seedMember();
    expectOk(world.services.waitlist.join(session.id, member.id));
    expectErr(world.services.waitlist.join(session.id, member.id), "conflict", "already_waitlisted");
  });

  it("rejects joining a session that has started", () => {
    const session = world.seedSession({ capacity: 1, startsAt: minutesFromNow(-5) });
    world.fill(session);
    expectErr(world.services.waitlist.join(session.id, world.seedMember().id), "conflict", "session_started");
  });

  it("answers not_found for an unknown session or member", () => {
    const session = world.seedSession();
    expectErr(world.services.waitlist.join("ses_nope", world.seedMember().id), "not_found");
    expectErr(world.services.waitlist.join(session.id, "mem_nope"), "not_found");
  });
});

describe("WaitlistService.leave", () => {
  let world: World;
  beforeEach(() => {
    world = makeWorld();
  });

  it("moves everyone behind the leaver up one place", () => {
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const [a, b, c] = [world.seedMember(), world.seedMember(), world.seedMember()];
    for (const m of [a, b, c]) expectOk(world.services.waitlist.join(session.id, m.id));
    expectOk(world.services.waitlist.leave(session.id, b!.id));
    const listing = expectOk(world.services.waitlist.list(session.id));
    expect(listing.map((row) => [row.member.id, row.position])).toEqual([[a!.id, 1], [c!.id, 2]]);
  });

  it("answers not_found for a member who is not waitlisted", () => {
    const session = world.seedSession();
    expectErr(world.services.waitlist.leave(session.id, world.seedMember().id), "not_found");
  });
});

describe("waitlist promotion on cancel", () => {
  let world: World;
  beforeEach(() => {
    world = makeWorld();
  });

  it("gives the freed place to the front of the waitlist", () => {
    const session = world.seedSession({ capacity: 1 });
    const holder = world.seedMember();
    const booking = world.seedBooking(session, holder);
    const [a, b] = [world.seedMember(), world.seedMember()];
    expectOk(world.services.waitlist.join(session.id, a.id));
    expectOk(world.services.waitlist.join(session.id, b.id));

    expectOk(world.services.bookings.cancel(booking.id));

    const confirmed = world.repos.bookings.listConfirmedForSession(session.id);
    expect(confirmed.map((x) => x.memberId)).toEqual([a.id]);
    const listing = expectOk(world.services.waitlist.list(session.id));
    expect(listing.map((row) => [row.member.id, row.position])).toEqual([[b.id, 1]]);
  });

  it("skips a waitlisted member who now has an overlapping booking", () => {
    const session = world.seedSession({ capacity: 1, startsAt: minutesFromNow(60) });
    const booking = world.seedBooking(session, world.seedMember());
    const [a, b] = [world.seedMember(), world.seedMember()];
    expectOk(world.services.waitlist.join(session.id, a.id));
    expectOk(world.services.waitlist.join(session.id, b.id));
    world.seedBooking(world.seedSession({ startsAt: minutesFromNow(90) }), a);

    expectOk(world.services.bookings.cancel(booking.id));

    expect(world.repos.bookings.listConfirmedForSession(session.id).map((x) => x.memberId)).toEqual([b.id]);
    expect(expectOk(world.services.waitlist.list(session.id))).toEqual([]);
  });

  it("leaves the waitlist alone when nobody is waiting", () => {
    const session = world.seedSession({ capacity: 1 });
    const booking = world.seedBooking(session, world.seedMember());
    expectOk(world.services.bookings.cancel(booking.id));
    expect(world.repos.bookings.countConfirmedForSession(session.id)).toBe(0);
  });
});
