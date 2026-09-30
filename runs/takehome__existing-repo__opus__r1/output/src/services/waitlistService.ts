import { toSummary, type MemberSummary } from "../domain/member.ts";
import { hasStarted } from "../domain/session.ts";
import { withPositions, type PositionedEntry, type WaitlistEntry } from "../domain/waitlist.ts";
import { conflict, notFound } from "../errors.ts";
import { err, ok, type Result } from "../result.ts";
import type { ServiceDeps } from "./deps.ts";

export interface WaitlistPlace {
  readonly entry: WaitlistEntry;
  readonly position: number;
  readonly member: MemberSummary;
}

export interface WaitlistService {
  join(sessionId: string, memberId: string): Result<PositionedEntry>;
  leave(sessionId: string, memberId: string): Result<void>;
  listForSession(sessionId: string): Result<WaitlistPlace[]>;
}

// Places are handed out from the waitlist by BookingService.cancel, so that
// every confirmed booking still goes through the booking rules.
export function createWaitlistService({ repos, clock }: ServiceDeps): WaitlistService {
  return {
    join(sessionId, memberId) {
      const member = repos.members.findById(memberId);
      if (!member) return err(notFound("member", memberId));
      const session = repos.sessions.findById(sessionId);
      if (!session) return err(notFound("session", sessionId));

      // Same precedence as booking: a member who already holds a place, or is
      // already queued, is told so before being told the session has room.
      if (hasStarted(session, clock.now())) {
        return err(conflict("session_started", "the session has already started"));
      }
      if (repos.bookings.listConfirmedForMember(memberId).some((booking) => booking.sessionId === sessionId)) {
        return err(conflict("already_booked", "the member already has a place in this session"));
      }
      if (repos.waitlist.find(sessionId, memberId)) {
        return err(conflict("already_waitlisted", "the member is already on this session's waitlist"));
      }
      if (repos.bookings.countConfirmedForSession(sessionId) < session.capacity) {
        return err(conflict("session_not_full", "the session still has places; book one instead"));
      }

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
      const queue = withPositions(repos.waitlist.listForSession(sessionId));
      const members = new Map(
        repos.members.findManyByIds(queue.map(({ entry }) => entry.memberId)).map((m) => [m.id, m]),
      );
      return ok(
        queue.flatMap(({ entry, position }) => {
          const member = members.get(entry.memberId);
          return member ? [{ entry, position, member: toSummary(member) }] : [];
        }),
      );
    },
  };
}
