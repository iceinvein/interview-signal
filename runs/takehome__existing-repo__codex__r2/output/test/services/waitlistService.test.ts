import { beforeEach, describe, expect, it } from "vitest";
import { expectErr, expectOk, FIXED_NOW, makeWorld, minutesFromNow, type World } from "../fixtures.ts";

describe("WaitlistService.join", () => {
  let world: World;
  beforeEach(() => {
    world = makeWorld();
  });

  it("adds members to the end of a full session's waitlist", () => {
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const first = world.seedMember();
    const second = world.seedMember();
    expect(expectOk(world.services.waitlists.join(session.id, first.id))).toEqual({
      sessionId: session.id, memberId: first.id, position: 1, joinedAt: FIXED_NOW,
    });
    world.clock.advanceMinutes(5);
    expect(expectOk(world.services.waitlists.join(session.id, second.id))).toEqual({
      sessionId: session.id, memberId: second.id, position: 2, joinedAt: minutesFromNow(5),
    });
  });

  it("rejects joining when the session still has places", () => {
    const session = world.seedSession({ capacity: 1 });
    expectErr(world.services.waitlists.join(session.id, world.seedMember().id), "conflict", "session_not_full");
  });

  it("reports already_booked before the full session conflict", () => {
    const session = world.seedSession({ capacity: 1 });
    const member = world.seedMember();
    world.seedBooking(session, member);
    expectErr(world.services.waitlists.join(session.id, member.id), "conflict", "already_booked");
  });

  it("rejects joining the same waitlist twice", () => {
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const member = world.seedMember();
    expectOk(world.services.waitlists.join(session.id, member.id));
    expectErr(world.services.waitlists.join(session.id, member.id), "conflict", "already_waitlisted");
  });

  it("rejects joining once the session has started", () => {
    const session = world.seedSession({ startsAt: minutesFromNow(10), capacity: 1 });
    world.fill(session);
    world.clock.advanceMinutes(10);
    expectErr(world.services.waitlists.join(session.id, world.seedMember().id), "conflict", "session_started");
  });

  it("returns not_found for unknown members and sessions", () => {
    const session = world.seedSession();
    const member = world.seedMember();
    expect(expectErr(world.services.waitlists.join(session.id, "mem_missing"), "not_found")).toMatchObject({ entity: "member" });
    expect(expectErr(world.services.waitlists.join("ses_missing", member.id), "not_found")).toMatchObject({ entity: "session" });
  });
});

describe("WaitlistService.leave and listForSession", () => {
  let world: World;
  beforeEach(() => {
    world = makeWorld();
  });

  it("moves everyone behind a removed member forward", () => {
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const members = [world.seedMember(), world.seedMember(), world.seedMember()];
    for (const member of members) expectOk(world.services.waitlists.join(session.id, member.id));
    expectOk(world.services.waitlists.leave(session.id, members[1]!.id));
    expect(expectOk(world.services.waitlists.listForSession(session.id)).map(({ position, member }) => [position, member.id]))
      .toEqual([[1, members[0]!.id], [2, members[2]!.id]]);
  });

  it("returns not_found for a member who is not on the waitlist", () => {
    const session = world.seedSession();
    const member = world.seedMember();
    expectErr(world.services.waitlists.leave(session.id, member.id), "not_found");
  });

  it("returns not_found for unknown sessions or members", () => {
    const session = world.seedSession();
    const member = world.seedMember();
    expect(expectErr(world.services.waitlists.listForSession("ses_missing"), "not_found")).toMatchObject({ entity: "session" });
    expect(expectErr(world.services.waitlists.leave("ses_missing", member.id), "not_found")).toMatchObject({ entity: "session" });
    expect(expectErr(world.services.waitlists.leave(session.id, "mem_missing"), "not_found")).toMatchObject({ entity: "member" });
  });
});
