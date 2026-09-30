import { beforeEach, describe, expect, it } from "vitest";
import { expectErr, expectOk, FIXED_NOW, makeWorld, minutesFromNow, type World } from "../fixtures.ts";

describe("WaitlistService", () => {
  let world: World;
  beforeEach(() => {
    world = makeWorld();
  });

  it("adds members to a full session in joining order", () => {
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const first = world.seedMember();
    const second = world.seedMember();
    expect(expectOk(world.services.waitlist.join(session.id, first.id))).toEqual({
      entry: { sessionId: session.id, memberId: first.id, joinedAt: FIXED_NOW }, position: 1,
    });
    world.clock.advanceMinutes(5);
    expect(expectOk(world.services.waitlist.join(session.id, second.id)).position).toBe(2);
    expect(world.repos.waitlist.listForSession(session.id).map((entry) => entry.memberId)).toEqual([first.id, second.id]);
  });

  it("rejects a waitlist request when the session has room", () => {
    const session = world.seedSession();
    expectErr(world.services.waitlist.join(session.id, world.seedMember().id), "conflict", "session_not_full");
  });

  it("reports already booked even when the session is full", () => {
    const session = world.seedSession({ capacity: 1 });
    const member = world.seedMember();
    world.seedBooking(session, member);
    expectErr(world.services.waitlist.join(session.id, member.id), "conflict", "already_booked");
  });

  it("rejects joining the same waitlist twice", () => {
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const member = world.seedMember();
    expectOk(world.services.waitlist.join(session.id, member.id));
    expectErr(world.services.waitlist.join(session.id, member.id), "conflict", "already_waitlisted");
  });

  it("rejects joining a session that has started", () => {
    const session = world.seedSession({ startsAt: minutesFromNow(-1), capacity: 1 });
    world.fill(session);
    expectErr(world.services.waitlist.join(session.id, world.seedMember().id), "conflict", "session_started");
  });

  it("returns not_found for an unknown session or member", () => {
    const session = world.seedSession();
    const member = world.seedMember();
    expect(expectErr(world.services.waitlist.join(session.id, "mem_missing"), "not_found")).toMatchObject({ entity: "member" });
    expect(expectErr(world.services.waitlist.join("ses_missing", member.id), "not_found")).toMatchObject({ entity: "session" });
    expect(expectErr(world.services.waitlist.listForSession("ses_missing"), "not_found")).toMatchObject({ entity: "session" });
  });

  it("moves later members up after one leaves and lets the member rejoin at the end", () => {
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const first = world.seedMember();
    const second = world.seedMember();
    const third = world.seedMember();
    for (const member of [first, second, third]) expectOk(world.services.waitlist.join(session.id, member.id));
    expectOk(world.services.waitlist.leave(session.id, second.id));
    expect(expectOk(world.services.waitlist.listForSession(session.id)).map(({ position, member }) => [position, member.id])).toEqual([
      [1, first.id], [2, third.id],
    ]);
    expect(expectOk(world.services.waitlist.join(session.id, second.id)).position).toBe(3);
  });

  it("returns not_found when leaving a waitlist the member is not on", () => {
    const session = world.seedSession();
    const member = world.seedMember();
    expectErr(world.services.waitlist.leave(session.id, member.id), "not_found");
  });

  it("promotes the front member to a confirmed booking on cancellation", () => {
    const session = world.seedSession({ capacity: 1 });
    const booked = world.seedMember();
    const original = world.seedBooking(session, booked);
    const first = world.seedMember();
    const second = world.seedMember();
    expectOk(world.services.waitlist.join(session.id, first.id));
    expectOk(world.services.waitlist.join(session.id, second.id));

    expectOk(world.services.bookings.cancel(original.id));
    expect(world.repos.bookings.findById(original.id)?.status).toBe("cancelled");
    expect(world.repos.bookings.listConfirmedForSession(session.id)).toEqual([
      expect.objectContaining({ memberId: first.id, status: "confirmed", createdAt: FIXED_NOW }),
    ]);
    expect(expectOk(world.services.waitlist.listForSession(session.id)).map(({ member, position }) => [member.id, position])).toEqual([
      [second.id, 1],
    ]);
  });
});
