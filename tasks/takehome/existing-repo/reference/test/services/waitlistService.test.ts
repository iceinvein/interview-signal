import { beforeEach, describe, expect, it } from "vitest";
import { expectErr, expectOk, FIXED_NOW, makeWorld, minutesFromNow, type World } from "../fixtures.ts";

describe("WaitlistService.join", () => {
  let world: World;
  beforeEach(() => {
    world = makeWorld();
  });

  it("puts the member at the back of a full session's waitlist", () => {
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    world.seedWaitlist(session, world.seedMember());
    const member = world.seedMember();
    world.clock.advanceMinutes(3);
    const place = expectOk(world.services.waitlist.join(session.id, member.id));
    expect(place).toEqual({
      entry: { sessionId: session.id, memberId: member.id, joinedAt: minutesFromNow(3) },
      position: 2,
    });
  });

  it("rejects joining a session that still has places", () => {
    const session = world.seedSession({ capacity: 2 });
    expectErr(world.services.waitlist.join(session.id, world.seedMember().id), "conflict", "session_not_full");
  });

  it("rejects a member who already has a place in the session", () => {
    const session = world.seedSession({ capacity: 1 });
    const member = world.seedMember();
    world.seedBooking(session, member);
    expectErr(world.services.waitlist.join(session.id, member.id), "conflict", "already_booked");
  });

  it("rejects a member who is already waiting", () => {
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const member = world.seedMember();
    world.seedWaitlist(session, member);
    expectErr(world.services.waitlist.join(session.id, member.id), "conflict", "already_waitlisted");
  });

  it("rejects joining once the session has started", () => {
    const session = world.seedSession({ capacity: 1, startsAt: minutesFromNow(-5) });
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

  it("removes the member and moves everyone behind them up", () => {
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const [first, second, third] = [world.seedMember(), world.seedMember(), world.seedMember()];
    for (const member of [first!, second!, third!]) world.seedWaitlist(session, member);
    expectOk(world.services.waitlist.leave(session.id, first!.id));
    const places = expectOk(world.services.waitlist.list(session.id));
    expect(places.map((place) => [place.position, place.member.id])).toEqual([
      [1, second!.id],
      [2, third!.id],
    ]);
  });

  it("returns not_found for a member who is not waiting", () => {
    const session = world.seedSession();
    const error = expectErr(world.services.waitlist.leave(session.id, world.seedMember().id), "not_found");
    expect(error).toMatchObject({ entity: "waitlist_entry" });
  });
});

describe("WaitlistService.list", () => {
  it("lists the queue in join order with member summaries only", () => {
    const world = makeWorld();
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const ada = world.seedMember({ name: "Ada" });
    const grace = world.seedMember({ name: "Grace" });
    world.seedWaitlist(session, ada, FIXED_NOW);
    world.seedWaitlist(session, grace, minutesFromNow(1));
    const places = expectOk(world.services.waitlist.list(session.id));
    expect(places.map(({ position, member }) => ({ position, member }))).toEqual([
      { position: 1, member: { id: ada.id, name: "Ada" } },
      { position: 2, member: { id: grace.id, name: "Grace" } },
    ]);
  });
});
