import { beforeEach, describe, expect, it } from "vitest";
import { expectErr, expectOk, minutesFromNow, makeWorld, type World } from "../fixtures.ts";

describe("WaitlistService.join", () => {
  let world: World;
  beforeEach(() => {
    world = makeWorld();
  });

  it("puts a member at the end of a full session's waitlist", () => {
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const first = expectOk(world.services.waitlist.join(session.id, world.seedMember().id));
    const second = expectOk(world.services.waitlist.join(session.id, world.seedMember().id));
    expect(first.position).toBe(1);
    expect(second.position).toBe(2);
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

  it("returns not_found for an unknown member or session", () => {
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    expect(expectErr(world.services.waitlist.join(session.id, "mem_x"), "not_found")).toMatchObject({ entity: "member" });
    expect(expectErr(world.services.waitlist.join("ses_x", world.seedMember().id), "not_found")).toMatchObject({
      entity: "session",
    });
  });
});

describe("WaitlistService.leave", () => {
  let world: World;
  beforeEach(() => {
    world = makeWorld();
  });

  it("moves everyone behind the member up one place", () => {
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

  it("returns not_found for a member who is not on the waitlist", () => {
    const session = world.seedSession({ capacity: 1 });
    expectErr(world.services.waitlist.leave(session.id, world.seedMember().id), "not_found");
  });
});

describe("WaitlistService.list", () => {
  it("lists members in queue order with their names", () => {
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
  });

  it("returns not_found for an unknown session", () => {
    expectErr(makeWorld().services.waitlist.list("ses_x"), "not_found");
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
    const a = world.seedMember();
    const b = world.seedMember();
    expectOk(world.services.waitlist.join(session.id, a.id));
    expectOk(world.services.waitlist.join(session.id, b.id));

    expectOk(world.services.bookings.cancel(booking.id));

    const confirmed = world.repos.bookings.listConfirmedForSession(session.id);
    expect(confirmed.map((x) => x.memberId)).toEqual([a.id]);
    const list = expectOk(world.services.waitlist.list(session.id));
    expect(list.map((row) => [row.member.id, row.position])).toEqual([[b.id, 1]]);
  });

  it("leaves the waitlist untouched when it is empty", () => {
    const session = world.seedSession({ capacity: 1 });
    const booking = world.seedBooking(session, world.seedMember());
    expectOk(world.services.bookings.cancel(booking.id));
    expect(world.repos.bookings.countConfirmedForSession(session.id)).toBe(0);
  });

  it("passes over a member who can no longer be booked and keeps their place", () => {
    const session = world.seedSession({ capacity: 1, startsAt: minutesFromNow(60) });
    const booking = world.seedBooking(session, world.seedMember());
    const blocked = world.seedMember();
    const next = world.seedMember();
    expectOk(world.services.waitlist.join(session.id, blocked.id));
    expectOk(world.services.waitlist.join(session.id, next.id));
    world.seedBooking(world.seedSession({ startsAt: minutesFromNow(90) }), blocked);

    expectOk(world.services.bookings.cancel(booking.id));

    expect(world.repos.bookings.listConfirmedForSession(session.id).map((x) => x.memberId)).toEqual([next.id]);
    expect(world.repos.waitlist.find(session.id, blocked.id)).toBeDefined();
  });
});
