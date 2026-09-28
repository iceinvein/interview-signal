import { beforeEach, describe, expect, it } from "vitest";
import { expectErr, expectOk, makeWorld, minutesFromNow, type World } from "../fixtures.ts";

describe("SessionService.schedule", () => {
  it("stores a valid session", () => {
    const world = makeWorld();
    const session = expectOk(
      world.services.sessions.schedule({
        title: "Spin",
        instructor: "Tom",
        startsAt: minutesFromNow(120),
        durationMinutes: 45,
        capacity: 8,
      }),
    );
    expect(world.repos.sessions.findById(session.id)).toEqual(session);
  });
});

describe("SessionService.get", () => {
  it("reports the places left after confirmed bookings", () => {
    const world = makeWorld();
    const session = world.seedSession({ capacity: 3 });
    world.seedBooking(session, world.seedMember());
    world.seedBooking(session, world.seedMember(), { status: "cancelled", cancelledAt: minutesFromNow(-5) });
    expect(expectOk(world.services.sessions.get(session.id)).spotsLeft).toBe(2);
  });
});

describe("SessionService.listUpcoming", () => {
  it("lists only sessions that have not started, soonest first", () => {
    const world = makeWorld();
    const later = world.seedSession({ startsAt: minutesFromNow(300) });
    const sooner = world.seedSession({ startsAt: minutesFromNow(60) });
    world.seedSession({ startsAt: minutesFromNow(-30) });
    const ids = world.services.sessions.listUpcoming().map(({ session }) => session.id);
    expect(ids).toEqual([sooner.id, later.id]);
  });
});

describe("SessionService.changeCapacity", () => {
  let world: World;
  beforeEach(() => {
    world = makeWorld();
  });

  it("raises the capacity and the places left with it", () => {
    const session = world.seedSession({ capacity: 2 });
    world.fill(session);
    const updated = expectOk(world.services.sessions.changeCapacity(session.id, 4));
    expect(updated).toMatchObject({ session: { capacity: 4 }, spotsLeft: 2 });
  });

  it("rejects a capacity below the confirmed bookings", () => {
    const session = world.seedSession({ capacity: 3 });
    world.fill(session);
    expectErr(world.services.sessions.changeCapacity(session.id, 2), "conflict", "capacity_below_bookings");
  });

  it("rejects a change once the session has started", () => {
    const session = world.seedSession({ startsAt: minutesFromNow(-1) });
    expectErr(world.services.sessions.changeCapacity(session.id, 5), "conflict", "session_started");
  });
});

describe("SessionService.changeCapacity with a waitlist", () => {
  it("fills the new places from the front of the waitlist", () => {
    const world = makeWorld();
    const session = world.seedSession({ capacity: 1 });
    world.fill(session);
    const waiting = [world.seedMember(), world.seedMember(), world.seedMember()];
    for (const member of waiting) world.seedWaitlist(session, member);
    const updated = expectOk(world.services.sessions.changeCapacity(session.id, 3));
    expect(updated.spotsLeft).toBe(0);
    expect(world.repos.waitlist.listForSession(session.id).map((e) => e.memberId)).toEqual([waiting[2]!.id]);
  });
});
