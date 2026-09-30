import { toSummary, type MemberSummary } from "../domain/member.ts";
import { hasStarted } from "../domain/session.ts";
import type { WaitlistEntry } from "../domain/waitlist.ts";
import { conflict, notFound } from "../errors.ts";
import { err, ok, type Result } from "../result.ts";
import type { ServiceDeps } from "./deps.ts";

export interface PositionedEntry {
  readonly entry: WaitlistEntry;
  readonly position: number;
}

export interface WaitlistListing extends PositionedEntry {
  readonly member: MemberSummary;
}

export interface WaitlistService {
  join(sessionId: string, memberId: string): Result<PositionedEntry>;
  leave(sessionId: string, memberId: string): Result<void>;
  list(sessionId: string): Result<WaitlistListing[]>;
}

export function createWaitlistService({ repos, clock }: ServiceDeps): WaitlistService {
  return {
    join(sessionId, memberId) {
      const member = repos.members.findById(memberId);
      if (!member) return err(notFound("member", memberId));
      const session = repos.sessions.findById(sessionId);
      if (!session) return err(notFound("session", sessionId));

      if (hasStarted(session, clock.now())) {
        return err(conflict("session_started", "the session has already started"));
      }
      if (repos.bookings.listConfirmedForMember(memberId).some((b) => b.sessionId === sessionId)) {
        return err(conflict("already_booked", "the member already has a place in this session"));
      }
      if (repos.waitlist.find(sessionId, memberId)) {
        return err(conflict("already_waitlisted", "the member is already on this waitlist"));
      }
      if (repos.bookings.countConfirmedForSession(sessionId) < session.capacity) {
        return err(conflict("session_not_full", "the session still has places; book instead"));
      }

      const entry: WaitlistEntry = { sessionId, memberId, joinedAt: clock.now() };
      repos.waitlist.insert(entry);
      return ok({ entry, position: repos.waitlist.listForSession(sessionId).length });
    },

    leave(sessionId, memberId) {
      if (!repos.waitlist.remove(sessionId, memberId)) return err(notFound("waitlist_entry", memberId));
      return ok(undefined);
    },

    list(sessionId) {
      if (!repos.sessions.findById(sessionId)) return err(notFound("session", sessionId));
      const entries = repos.waitlist.listForSession(sessionId);
      const members = new Map(repos.members.findManyByIds(entries.map((e) => e.memberId)).map((m) => [m.id, m]));
      return ok(
        entries.flatMap((entry, index) => {
          const member = members.get(entry.memberId);
          return member ? [{ entry, position: index + 1, member: toSummary(member) }] : [];
        }),
      );
    },
  };
}
