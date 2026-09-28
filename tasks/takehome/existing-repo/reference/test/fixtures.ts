import { expect } from "vitest";
import { buildApp } from "../src/app.ts";
import { fixedClock } from "../src/clock.ts";
import type { Booking } from "../src/domain/booking.ts";
import type { Member } from "../src/domain/member.ts";
import type { Session } from "../src/domain/session.ts";
import type { WaitlistEntry } from "../src/domain/waitlist.ts";
import type { AppError, ConflictCode } from "../src/errors.ts";
import type { HttpResponse, Method } from "../src/http/types.ts";
import { sequentialIds } from "../src/ids.ts";
import { createMemoryRepositories } from "../src/repositories/memory/index.ts";
import { createServices } from "../src/services/index.ts";
import type { Result } from "../src/result.ts";

// A Monday morning. Every test runs at this instant unless it moves the clock.
export const FIXED_NOW = new Date("2026-03-02T09:00:00.000Z");

export function minutesFromNow(minutes: number): Date {
  return new Date(FIXED_NOW.getTime() + minutes * 60_000);
}

let seedCounter = 0;

export function aMember(overrides: Partial<Member> = {}): Member {
  seedCounter += 1;
  return {
    id: `mem_seed_${seedCounter}`,
    name: `Member ${seedCounter}`,
    email: `member${seedCounter}@example.com`,
    createdAt: FIXED_NOW,
    ...overrides,
  };
}

export function aSession(overrides: Partial<Session> = {}): Session {
  seedCounter += 1;
  return {
    id: `ses_seed_${seedCounter}`,
    title: `Class ${seedCounter}`,
    instructor: "Priya",
    startsAt: minutesFromNow(24 * 60),
    durationMinutes: 60,
    capacity: 10,
    createdAt: FIXED_NOW,
    ...overrides,
  };
}

export function aBooking(overrides: Partial<Booking> & Pick<Booking, "sessionId" | "memberId">): Booking {
  seedCounter += 1;
  return { id: `bkg_seed_${seedCounter}`, status: "confirmed", createdAt: FIXED_NOW, cancelledAt: null, ...overrides };
}

// Service-level world: real services over in-memory repositories.
export function makeWorld() {
  const repos = createMemoryRepositories();
  const clock = fixedClock(FIXED_NOW);
  const services = createServices({ repos, clock, ids: sequentialIds() });

  return {
    repos,
    clock,
    services,
    seedMember(overrides: Partial<Member> = {}): Member {
      const member = aMember(overrides);
      repos.members.insert(member);
      return member;
    },
    seedSession(overrides: Partial<Session> = {}): Session {
      const session = aSession(overrides);
      repos.sessions.insert(session);
      return session;
    },
    seedBooking(session: Session, member: Member, overrides: Partial<Booking> = {}): Booking {
      const booking = aBooking({ sessionId: session.id, memberId: member.id, ...overrides });
      repos.bookings.insert(booking);
      return booking;
    },
    // Puts the member at the back of the session's waitlist.
    seedWaitlist(session: Session, member: Member, joinedAt: Date = FIXED_NOW): WaitlistEntry {
      const entry: WaitlistEntry = { sessionId: session.id, memberId: member.id, joinedAt };
      repos.waitlist.append(entry);
      return entry;
    },
    // Fills every remaining place in the session with new members.
    fill(session: Session): Member[] {
      const taken = repos.bookings.countConfirmedForSession(session.id);
      return Array.from({ length: session.capacity - taken }, () => {
        const member = aMember();
        repos.members.insert(member);
        repos.bookings.insert(aBooking({ sessionId: session.id, memberId: member.id }));
        return member;
      });
    },
  };
}

export type World = ReturnType<typeof makeWorld>;

// HTTP-level app wired exactly as production, with a pinned clock and ids.
export function makeTestApp() {
  const clock = fixedClock(FIXED_NOW);
  const app = buildApp({ clock, ids: sequentialIds() });
  return {
    app,
    clock,
    request(method: Method, path: string, body?: unknown): HttpResponse {
      return app.handle(body === undefined ? { method, path } : { method, path, body });
    },
  };
}

export function expectOk<T>(result: Result<T>): T {
  if (!result.ok) {
    expect.fail(`expected ok, got ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

export function expectErr<T>(result: Result<T>, kind: AppError["kind"], code?: ConflictCode): AppError {
  if (result.ok) {
    expect.fail(`expected ${kind}${code ? ` (${code})` : ""}, got ok`);
  }
  expect(result.error.kind).toBe(kind);
  if (code !== undefined) {
    expect(result.error).toMatchObject({ code });
  }
  return result.error;
}

export function errorCode(response: HttpResponse): string | undefined {
  return (response.body as { error?: { code?: string } } | undefined)?.error?.code;
}
