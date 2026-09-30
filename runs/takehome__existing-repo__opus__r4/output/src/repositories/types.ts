import type { Booking } from "../domain/booking.ts";
import type { Member } from "../domain/member.ts";
import type { Session } from "../domain/session.ts";
import type { WaitlistEntry } from "../domain/waitlist.ts";

// Repositories store and fetch. They make no business decisions and never
// return Result: a missing row is `undefined`, and the service decides
// whether that is an error.

export interface MemberRepository {
  insert(member: Member): void;
  findById(id: string): Member | undefined;
  findByEmail(email: string): Member | undefined;
  findManyByIds(ids: readonly string[]): Member[];
}

export interface SessionRepository {
  insert(session: Session): void;
  update(session: Session): void;
  findById(id: string): Session | undefined;
  findManyByIds(ids: readonly string[]): Session[];
  listStartingAfter(at: Date): Session[];
}

export interface BookingRepository {
  insert(booking: Booking): void;
  update(booking: Booking): void;
  findById(id: string): Booking | undefined;
  // Confirmed bookings only, oldest first.
  listConfirmedForSession(sessionId: string): Booking[];
  listConfirmedForMember(memberId: string): Booking[];
  countConfirmedForSession(sessionId: string): number;
}

// One entry per (session, member).
export interface WaitlistRepository {
  insert(entry: WaitlistEntry): void;
  delete(sessionId: string, memberId: string): void;
  find(sessionId: string, memberId: string): WaitlistEntry | undefined;
  // Queue order: earliest joined first.
  listForSession(sessionId: string): WaitlistEntry[];
}

export interface Repositories {
  readonly members: MemberRepository;
  readonly sessions: SessionRepository;
  readonly bookings: BookingRepository;
  readonly waitlist: WaitlistRepository;
}
