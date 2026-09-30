import { describe, expect, it } from "vitest";
import { expectErr, expectOk, FIXED_NOW, makeWorld, minutesFromNow } from "../fixtures.ts";

describe("WaitlistService.join", () => {
  it("adds members to a full session in queue order even when they join at the same time", () => {
    const world = makeWorld();
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const first = world.seedMember();
    const second = world.seedMember();
    expect(expectOk(world.services.waitlist.join(session.id, first.id))).toEqual({
      entry: { sessionId: session.id, memberId: first.id, joinedAt: FIXED_NOW }, position: 1,
    });
    expect(expectOk(world.services.waitlist.join(session.id, second.id)).position).toBe(2);
    expect(world.repos.waitlist.listForSession(session.id).map((entry) => entry.memberId)).toEqual([first.id, second.id]);
  });

  it("rejects a session that still has places", () => {
    const world = makeWorld();
    expectErr(world.services.waitlist.join(world.seedSession().id, world.seedMember().id), "conflict", "session_not_full");
  });

  it("rejects a member who already has a confirmed place", () => {
    const world = makeWorld();
    const session = world.seedSession({ capacity: 1 });
    const member = world.seedMember();
    world.seedBooking(session, member);
    expectErr(world.services.waitlist.join(session.id, member.id), "conflict", "already_booked");
  });

  it("rejects a member who is already waitlisted", () => {
    const world = makeWorld();
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const member = world.seedMember();
    expectOk(world.services.waitlist.join(session.id, member.id));
    expectErr(world.services.waitlist.join(session.id, member.id), "conflict", "already_waitlisted");
  });

  it("rejects joining after the session starts", () => {
    const world = makeWorld();
    const session = world.seedSession({ capacity: 1, startsAt: minutesFromNow(5) });
    world.fill(session);
    world.clock.advanceMinutes(5);
    expectErr(world.services.waitlist.join(session.id, world.seedMember().id), "conflict", "session_started");
  });

  it("returns not_found for an unknown member or session", () => {
    const world = makeWorld();
    const session = world.seedSession();
    const member = world.seedMember();
    expect(expectErr(world.services.waitlist.join(session.id, "mem_missing"), "not_found")).toMatchObject({ entity: "member" });
    expect(expectErr(world.services.waitlist.join("ses_missing", member.id), "not_found")).toMatchObject({ entity: "session" });
  });
});

describe("WaitlistService.leave", () => {
  it("moves later members forward when someone leaves", () => {
    const world = makeWorld();
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const first = world.seedMember();
    const second = world.seedMember();
    expectOk(world.services.waitlist.join(session.id, first.id));
    expectOk(world.services.waitlist.join(session.id, second.id));
    expectOk(world.services.waitlist.leave(session.id, first.id));
    expect(expectOk(world.services.waitlist.listForSession(session.id)).map((row) => row.position)).toEqual([1]);
    expect(world.repos.waitlist.find(session.id, second.id)).toBeDefined();
  });

  it("returns not_found for a member who is not waitlisted", () => {
    const world = makeWorld();
    expectErr(world.services.waitlist.leave(world.seedSession().id, world.seedMember().id), "not_found");
  });
});

describe("WaitlistService.listForSession", () => {
  it("lists members in queue order with contact details", () => {
    const world = makeWorld();
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const member = world.seedMember({ name: "Ada", email: "ada@example.com" });
    expectOk(world.services.waitlist.join(session.id, member.id));
    expect(expectOk(world.services.waitlist.listForSession(session.id))).toMatchObject([
      { position: 1, member: { id: member.id, name: "Ada", email: "ada@example.com" } },
    ]);
  });

  it("returns not_found for an unknown session", () => {
    const world = makeWorld();
    expectErr(world.services.waitlist.listForSession("ses_missing"), "not_found");
  });
});
