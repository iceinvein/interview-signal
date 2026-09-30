import { beforeEach, describe, expect, it } from "vitest";
import { expectErr, expectOk, makeWorld, minutesFromNow, type World } from "../fixtures.ts";

describe("WaitlistService.join", () => {
  let world: World;
  beforeEach(() => {
    world = makeWorld();
  });

  it("adds the member to the back of a full session's waitlist", () => {
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    world.seedWaitlistEntry(session, world.seedMember());
    const member = world.seedMember();
    world.clock.advanceMinutes(5);
    const place = expectOk(world.services.waitlist.join(session.id, member.id));
    expect(place).toEqual({
      entry: { sessionId: session.id, memberId: member.id, joinedAt: minutesFromNow(5) },
      position: 2,
    });
  });

  it("rejects joining when the session still has places", () => {
    const session = world.seedSession({ capacity: 2 });
    world.seedBooking(session, world.seedMember());
    expectErr(world.services.waitlist.join(session.id, world.seedMember().id), "conflict", "session_not_full");
  });

  it("rejects a member who already has a place in the session", () => {
    const session = world.seedSession({ capacity: 1 });
    const member = world.seedMember();
    world.seedBooking(session, member);
    expectErr(world.services.waitlist.join(session.id, member.id), "conflict", "already_booked");
  });

  it("rejects a member who is already on the waitlist", () => {
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const member = world.seedMember();
    world.seedWaitlistEntry(session, member);
    expectErr(world.services.waitlist.join(session.id, member.id), "conflict", "already_waitlisted");
  });

  it("rejects joining once the session has started", () => {
    const session = world.seedSession({ capacity: 1, startsAt: minutesFromNow(-10) });
    world.fill(session);
    expectErr(world.services.waitlist.join(session.id, world.seedMember().id), "conflict", "session_started");
  });

  it("returns not_found for an unknown member or session", () => {
    const session = world.seedSession();
    const member = world.seedMember();
    expect(expectErr(world.services.waitlist.join(session.id, "mem_x"), "not_found")).toMatchObject({ entity: "member" });
    expect(expectErr(world.services.waitlist.join("ses_x", member.id), "not_found")).toMatchObject({ entity: "session" });
  });
});

describe("WaitlistService.leave", () => {
  let world: World;
  beforeEach(() => {
    world = makeWorld();
  });

  it("moves everyone behind the leaving member up one place", () => {
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const [first, second, third] = [world.seedMember(), world.seedMember(), world.seedMember()];
    for (const member of [first!, second!, third!]) world.seedWaitlistEntry(session, member);
    expectOk(world.services.waitlist.leave(session.id, first!.id));
    const rows = expectOk(world.services.waitlist.listForSession(session.id));
    expect(rows.map((row) => [row.position, row.member.id])).toEqual([
      [1, second!.id],
      [2, third!.id],
    ]);
  });

  it("returns not_found for a member who is not on the waitlist", () => {
    const session = world.seedSession();
    const error = expectErr(world.services.waitlist.leave(session.id, world.seedMember().id), "not_found");
    expect(error).toMatchObject({ entity: "waitlist_entry" });
  });
});

describe("WaitlistService.listForSession", () => {
  it("lists the queue in order with member summaries only", () => {
    const world = makeWorld();
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const ada = world.seedMember({ name: "Ada" });
    const grace = world.seedMember({ name: "Grace" });
    world.seedWaitlistEntry(session, ada);
    world.seedWaitlistEntry(session, grace);
    const rows = expectOk(world.services.waitlist.listForSession(session.id));
    expect(rows.map((row) => [row.position, row.member])).toEqual([
      [1, { id: ada.id, name: "Ada" }],
      [2, { id: grace.id, name: "Grace" }],
    ]);
  });
});
