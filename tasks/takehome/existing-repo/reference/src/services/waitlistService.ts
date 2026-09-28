import { toSummary, type MemberSummary } from "../domain/member.ts";
import { hasStarted } from "../domain/session.ts";
import type { WaitlistEntry } from "../domain/waitlist.ts";
import { conflict, notFound } from "../errors.ts";
import { err, ok, type Result } from "../result.ts";
import type { ServiceDeps } from "./deps.ts";

export interface WaitlistPlace {
  readonly entry: WaitlistEntry;
  readonly position: number;
}

export interface WaitlistListing extends WaitlistPlace {
  readonly member: MemberSummary;
}

export interface WaitlistService {
  join(sessionId: string, memberId: string): Result<WaitlistPlace>;
  leave(sessionId: string, memberId: string): Result<WaitlistEntry>;
  list(sessionId: string): Result<WaitlistListing[]>;
}

export function createWaitlistService({ repos, clock }: ServiceDeps): WaitlistService {
  return {
    join(sessionId, memberId) {
      if (!repos.members.findById(memberId)) return err(notFound("member", memberId));
      const session = repos.sessions.findById(sessionId);
      if (!session) return err(notFound("session", sessionId));

      if (hasStarted(session, clock.now())) {
        return err(conflict("session_started", "the session has already started"));
      }
      const confirmed = repos.bookings.listConfirmedForSession(sessionId);
      if (confirmed.some((booking) => booking.memberId === memberId)) {
        return err(conflict("already_booked", "the member already has a place in this session"));
      }
      if (repos.waitlist.find(sessionId, memberId)) {
        return err(conflict("already_waitlisted", "the member is already on this session's waitlist"));
      }
      if (confirmed.length < session.capacity) {
        return err(conflict("session_not_full", "the session has places left; book one instead"));
      }

      const entry: WaitlistEntry = { sessionId, memberId, joinedAt: clock.now() };
      repos.waitlist.append(entry);
      return ok({ entry, position: repos.waitlist.listForSession(sessionId).length });
    },

    leave(sessionId, memberId) {
      const entry = repos.waitlist.find(sessionId, memberId);
      if (!entry) return err(notFound("waitlist_entry", `${sessionId}/${memberId}`));
      repos.waitlist.remove(sessionId, memberId);
      return ok(entry);
    },

    list(sessionId) {
      if (!repos.sessions.findById(sessionId)) return err(notFound("session", sessionId));
      const entries = repos.waitlist.listForSession(sessionId);
      const members = new Map(
        repos.members.findManyByIds(entries.map((entry) => entry.memberId)).map((m) => [m.id, m]),
      );
      return ok(
        entries.flatMap((entry, index) => {
          const member = members.get(entry.memberId);
          return member ? [{ entry, position: index + 1, member: toSummary(member) }] : [];
        }),
      );
    },
  };
}
