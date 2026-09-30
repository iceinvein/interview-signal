import { toSummary, type Member, type MemberSummary } from "../domain/member.ts";
import { hasStarted, type Session } from "../domain/session.ts";
import type { WaitlistEntry } from "../domain/waitlist.ts";
import { conflict, notFound, type AppError } from "../errors.ts";
import { err, ok, type Result } from "../result.ts";
import type { ServiceDeps } from "./deps.ts";

// Positions are not stored: they are derived from queue order, so leaving the
// waitlist moves everyone behind up without rewriting any rows.
export interface WaitlistPlace {
  readonly entry: WaitlistEntry;
  readonly position: number;
}

export interface WaitlistMember extends WaitlistPlace {
  readonly member: MemberSummary;
}

// Places freed by a cancellation are handed out in BookingService.cancel, so
// that every confirmed booking still goes through the booking rules.
export interface WaitlistService {
  join(sessionId: string, memberId: string): Result<WaitlistPlace>;
  leave(sessionId: string, memberId: string): Result<void>;
  listForSession(sessionId: string): Result<WaitlistMember[]>;
}

export function createWaitlistService({ repos, clock }: ServiceDeps): WaitlistService {
  // Same order as booking: a member who already holds a place is told so
  // rather than being told the session has room.
  function checkCanJoin(session: Session, member: Member): AppError | undefined {
    if (hasStarted(session, clock.now())) {
      return conflict("session_started", "the session has already started");
    }
    const memberBookings = repos.bookings.listConfirmedForMember(member.id);
    if (memberBookings.some((booking) => booking.sessionId === session.id)) {
      return conflict("already_booked", "the member already has a place in this session");
    }
    if (repos.waitlist.find(session.id, member.id)) {
      return conflict("already_waitlisted", "the member is already on this session's waitlist");
    }
    if (repos.bookings.countConfirmedForSession(session.id) < session.capacity) {
      return conflict("session_not_full", "the session still has places; book one instead");
    }
    return undefined;
  }

  return {
    join(sessionId, memberId) {
      const member = repos.members.findById(memberId);
      if (!member) return err(notFound("member", memberId));
      const session = repos.sessions.findById(sessionId);
      if (!session) return err(notFound("session", sessionId));

      const refusal = checkCanJoin(session, member);
      if (refusal) return err(refusal);

      const entry: WaitlistEntry = { sessionId, memberId, joinedAt: clock.now() };
      repos.waitlist.insert(entry);
      return ok({ entry, position: repos.waitlist.listForSession(sessionId).length });
    },

    leave(sessionId, memberId) {
      if (!repos.sessions.findById(sessionId)) return err(notFound("session", sessionId));
      if (!repos.waitlist.find(sessionId, memberId)) return err(notFound("waitlist_entry", memberId));
      repos.waitlist.remove(sessionId, memberId);
      return ok(undefined);
    },

    listForSession(sessionId) {
      if (!repos.sessions.findById(sessionId)) return err(notFound("session", sessionId));
      const queue = repos.waitlist.listForSession(sessionId);
      const members = new Map(repos.members.findManyByIds(queue.map((entry) => entry.memberId)).map((m) => [m.id, m]));
      return ok(
        queue.flatMap((entry, index) => {
          const member = members.get(entry.memberId);
          return member ? [{ entry, position: index + 1, member: toSummary(member) }] : [];
        }),
      );
    },
  };
}
