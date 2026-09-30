import { beforeEach, describe, expect, it } from "vitest";
import { expectErr, expectOk, FIXED_NOW, makeWorld, minutesFromNow, type World } from "../fixtures.ts";

describe("WaitlistService.join", () => {
  let world: World;
  beforeEach(() => {
    world = makeWorld();
  });

  it("adds members at the end of a full session's queue", () => {
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const first = world.seedMember();
    const second = world.seedMember();
    expect(expectOk(world.services.waitlists.join(session.id, first.id))).toEqual({
      entry: { sessionId: session.id, memberId: first.id, joinedAt: FIXED_NOW },
      position: 1,
    });
    world.clock.advanceMinutes(5);
    expect(expectOk(world.services.waitlists.join(session.id, second.id)).position).toBe(2);
    expect(world.repos.waitlists.listForSession(session.id)[1]?.joinedAt).toEqual(minutesFromNow(5));
  });

  it("rejects a waitlist join when the session has places", () => {
    const session = world.seedSession();
    expectErr(world.services.waitlists.join(session.id, world.seedMember().id), "conflict", "session_not_full");
  });

  it("rejects a member who already has a confirmed place in a full session", () => {
    const session = world.seedSession({ capacity: 1 });
    const member = world.seedMember();
    world.seedBooking(session, member);
    expectErr(world.services.waitlists.join(session.id, member.id), "conflict", "already_booked");
  });

  it("rejects a member who is already waitlisted", () => {
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const member = world.seedMember();
    expectOk(world.services.waitlists.join(session.id, member.id));
    expectErr(world.services.waitlists.join(session.id, member.id), "conflict", "already_waitlisted");
  });

  it("rejects a join once the session has started", () => {
    const session = world.seedSession({ startsAt: minutesFromNow(5), capacity: 1 });
    world.fill(session);
    world.clock.advanceMinutes(5);
    expectErr(world.services.waitlists.join(session.id, world.seedMember().id), "conflict", "session_started");
  });

  it("returns not_found for an unknown member or session", () => {
    const session = world.seedSession();
    const member = world.seedMember();
    expect(expectErr(world.services.waitlists.join(session.id, "mem_x"), "not_found")).toMatchObject({ entity: "member" });
    expect(expectErr(world.services.waitlists.join("ses_x", member.id), "not_found")).toMatchObject({ entity: "session" });
  });
});

describe("WaitlistService.leave", () => {
  it("moves everyone behind a departing member forward", () => {
    const world = makeWorld();
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const members = [world.seedMember(), world.seedMember(), world.seedMember()];
    for (const member of members) expectOk(world.services.waitlists.join(session.id, member.id));
    expectOk(world.services.waitlists.leave(session.id, members[1]!.id));
    const remaining = expectOk(world.services.waitlists.listForSession(session.id));
    expect(remaining.map(({ position, member }) => [position, member.id])).toEqual([
      [1, members[0]!.id],
      [2, members[2]!.id],
    ]);
  });

  it("returns not_found for a member who is not waitlisted", () => {
    const world = makeWorld();
    const session = world.seedSession();
    expectErr(world.services.waitlists.leave(session.id, "mem_x"), "not_found");
  });

  it("puts a member who rejoins at the end of the queue", () => {
    const world = makeWorld();
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const first = world.seedMember();
    const second = world.seedMember();
    expectOk(world.services.waitlists.join(session.id, first.id));
    expectOk(world.services.waitlists.join(session.id, second.id));
    expectOk(world.services.waitlists.leave(session.id, first.id));
    expect(expectOk(world.services.waitlists.join(session.id, first.id)).position).toBe(2);
    expect(expectOk(world.services.waitlists.listForSession(session.id)).map(({ member }) => member.id))
      .toEqual([second.id, first.id]);
  });
});

describe("WaitlistService.listForSession", () => {
  it("lists only this session's queue with member details", () => {
    const world = makeWorld();
    const firstSession = world.seedSession({ capacity: 1 });
    const otherSession = world.seedSession({ capacity: 1 });
    world.fill(firstSession);
    world.fill(otherSession);
    const first = world.seedMember({ name: "Ada", email: "ada@example.com" });
    const other = world.seedMember();
    expectOk(world.services.waitlists.join(firstSession.id, first.id));
    expectOk(world.services.waitlists.join(otherSession.id, other.id));
    expect(expectOk(world.services.waitlists.listForSession(firstSession.id))).toEqual([
      { entry: { sessionId: firstSession.id, memberId: first.id, joinedAt: FIXED_NOW }, position: 1, member: first },
    ]);
  });

  it("returns not_found for an unknown session", () => {
    const world = makeWorld();
    expectErr(world.services.waitlists.listForSession("ses_x"), "not_found");
  });
});
