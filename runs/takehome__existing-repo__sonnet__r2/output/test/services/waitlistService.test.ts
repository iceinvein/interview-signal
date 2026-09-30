import { beforeEach, describe, expect, it } from "vitest";
import { expectErr, expectOk, makeWorld, minutesFromNow, type World } from "../fixtures.ts";

describe("WaitlistService.join", () => {
  let world: World;
  beforeEach(() => {
    world = makeWorld();
  });

  it("adds a member to the end of a full session's waitlist", () => {
    const session = world.seedSession({ capacity: 2 });
    world.fill(session);
    const first = world.seedMember();
    const second = world.seedMember();
    expect(expectOk(world.services.waitlist.join(session.id, first.id)).position).toBe(1);
    const joined = expectOk(world.services.waitlist.join(session.id, second.id));
    expect(joined).toMatchObject({ position: 2, entry: { sessionId: session.id, memberId: second.id } });
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

  it("reports an unknown session or member as not found", () => {
    const session = world.seedSession({ capacity: 1 });
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
    for (const m of [a, b, c]) expectOk(world.services.waitlist.join(session.id, m!.id));
    expectOk(world.services.waitlist.leave(session.id, a!.id));
    const list = expectOk(world.services.waitlist.list(session.id));
    expect(list.map((row) => [row.member.id, row.position])).toEqual([
      [b!.id, 1],
      [c!.id, 2],
    ]);
  });

  it("reports a member who is not waitlisted as not found", () => {
    const session = world.seedSession({ capacity: 1 });
    expectErr(world.services.waitlist.leave(session.id, world.seedMember().id), "not_found");
  });
});

describe("WaitlistService.list", () => {
  it("lists members in queue order with their names and no contact details", () => {
    const world = makeWorld();
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const a = world.seedMember({ name: "Ada" });
    const b = world.seedMember({ name: "Grace" });
    expectOk(world.services.waitlist.join(session.id, a.id));
    expectOk(world.services.waitlist.join(session.id, b.id));
    const list = expectOk(world.services.waitlist.list(session.id));
    expect(list.map((row) => [row.position, row.member.name])).toEqual([
      [1, "Ada"],
      [2, "Grace"],
    ]);
    expect(list[0]!.member).not.toHaveProperty("email");
  });

  it("reports an unknown session as not found", () => {
    expectErr(makeWorld().services.waitlist.list("ses_nope"), "not_found");
  });
});

describe("waitlist promotion on cancellation", () => {
  let world: World;
  beforeEach(() => {
    world = makeWorld();
  });

  it("gives the freed place to the front of the waitlist", () => {
    const session = world.seedSession({ capacity: 1 });
    const holder = world.seedMember();
    const booking = world.seedBooking(session, holder);
    const first = world.seedMember();
    const second = world.seedMember();
    expectOk(world.services.waitlist.join(session.id, first.id));
    expectOk(world.services.waitlist.join(session.id, second.id));

    expectOk(world.services.bookings.cancel(booking.id));

    const confirmed = world.repos.bookings.listConfirmedForSession(session.id);
    expect(confirmed.map((b) => b.memberId)).toEqual([first.id]);
    const list = expectOk(world.services.waitlist.list(session.id));
    expect(list.map((row) => [row.member.id, row.position])).toEqual([[second.id, 1]]);
  });

  it("keeps the session's places within capacity", () => {
    const session = world.seedSession({ capacity: 1 });
    const booking = world.seedBooking(session, world.seedMember());
    expectOk(world.services.waitlist.join(session.id, world.seedMember().id));
    expectOk(world.services.waitlist.join(session.id, world.seedMember().id));
    expectOk(world.services.bookings.cancel(booking.id));
    expect(world.repos.bookings.countConfirmedForSession(session.id)).toBe(1);
  });

  it("passes over a waitlisted member who now has an overlapping booking", () => {
    const session = world.seedSession({ capacity: 1, startsAt: minutesFromNow(120) });
    const booking = world.seedBooking(session, world.seedMember());
    const clashing = world.seedMember();
    const next = world.seedMember();
    expectOk(world.services.waitlist.join(session.id, clashing.id));
    expectOk(world.services.waitlist.join(session.id, next.id));
    const other = world.seedSession({ startsAt: minutesFromNow(120) });
    world.seedBooking(other, clashing);

    expectOk(world.services.bookings.cancel(booking.id));

    expect(world.repos.bookings.listConfirmedForSession(session.id).map((b) => b.memberId)).toEqual([next.id]);
    expect(world.repos.waitlist.find(session.id, clashing.id)).toBeDefined();
  });

  it("leaves the place free when nobody is waiting", () => {
    const session = world.seedSession({ capacity: 1 });
    const booking = world.seedBooking(session, world.seedMember());
    expectOk(world.services.bookings.cancel(booking.id));
    expect(world.repos.bookings.countConfirmedForSession(session.id)).toBe(0);
  });

  it("drops a waitlisted member from the queue when they book directly", () => {
    const session = world.seedSession({ capacity: 1 });
    const holder = world.seedBooking(session, world.seedMember());
    const member = world.seedMember();
    expectOk(world.services.waitlist.join(session.id, member.id));
    expectOk(world.services.sessions.changeCapacity(session.id, 2));
    expectOk(world.services.bookings.book(session.id, member.id));
    expect(world.repos.waitlist.find(session.id, member.id)).toBeUndefined();
    expect(holder.status).toBe("confirmed");
  });
});
