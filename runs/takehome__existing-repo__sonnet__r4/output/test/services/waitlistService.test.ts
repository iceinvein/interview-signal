import { beforeEach, describe, expect, it } from "vitest";
import { expectErr, expectOk, minutesFromNow, makeWorld, type World } from "../fixtures.ts";

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
    expect(first.position).toBe(1);
    expect(second.position).toBe(2);
    expect(second.entry.joinedAt).toEqual(minutesFromNow(0));
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
  it("removes the member and moves everyone behind them up", () => {
    const world = makeWorld();
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const [a, b, c] = [world.seedMember(), world.seedMember(), world.seedMember()];
    for (const m of [a, b, c]) expectOk(world.services.waitlist.join(session.id, m!.id));
    expectOk(world.services.waitlist.leave(session.id, b!.id));
    const rows = expectOk(world.services.waitlist.listForSession(session.id));
    expect(rows.map((r) => [r.position, r.member.id])).toEqual([
      [1, a!.id],
      [2, c!.id],
    ]);
  });

  it("returns not_found for a member who is not on the waitlist", () => {
    const world = makeWorld();
    const session = world.seedSession();
    expectErr(world.services.waitlist.leave(session.id, world.seedMember().id), "not_found");
  });
});

describe("WaitlistService.listForSession", () => {
  it("lists the queue in order with member summaries", () => {
    const world = makeWorld();
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const ada = world.seedMember({ name: "Ada" });
    const grace = world.seedMember({ name: "Grace" });
    expectOk(world.services.waitlist.join(session.id, ada.id));
    expectOk(world.services.waitlist.join(session.id, grace.id));
    const rows = expectOk(world.services.waitlist.listForSession(session.id));
    expect(rows).toEqual([
      { position: 1, member: { id: ada.id, name: "Ada" } },
      { position: 2, member: { id: grace.id, name: "Grace" } },
    ]);
  });
});

describe("cancelling a booking with a waitlist", () => {
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
    const rows = expectOk(world.services.waitlist.listForSession(session.id));
    expect(rows.map((r) => [r.position, r.member.id])).toEqual([[1, second.id]]);
  });

  it("leaves the place free when the waitlist is empty", () => {
    const session = world.seedSession({ capacity: 1 });
    const booking = world.seedBooking(session, world.seedMember());
    expectOk(world.services.bookings.cancel(booking.id));
    expect(world.repos.bookings.countConfirmedForSession(session.id)).toBe(0);
  });

  it("skips a waitlisted member who now has an overlapping booking and keeps their place", () => {
    const session = world.seedSession({ capacity: 1, startsAt: minutesFromNow(120) });
    const booking = world.seedBooking(session, world.seedMember());
    const clashing = world.seedMember();
    const next = world.seedMember();
    expectOk(world.services.waitlist.join(session.id, clashing.id));
    expectOk(world.services.waitlist.join(session.id, next.id));
    world.seedBooking(world.seedSession({ startsAt: minutesFromNow(150) }), clashing);

    expectOk(world.services.bookings.cancel(booking.id));

    expect(world.repos.bookings.listConfirmedForSession(session.id).map((b) => b.memberId)).toEqual([next.id]);
    const rows = expectOk(world.services.waitlist.listForSession(session.id));
    expect(rows.map((r) => r.member.id)).toEqual([clashing.id]);
  });
});
