import type { Member } from "../domain/member.ts";
import { hasStarted } from "../domain/session.ts";
import type { WaitlistEntry } from "../domain/waitlist.ts";
import { conflict, notFound } from "../errors.ts";
import { err, ok, type Result } from "../result.ts";
import type { ServiceDeps } from "./deps.ts";

export interface PositionedWaitlistEntry {
  readonly entry: WaitlistEntry;
  readonly position: number;
}

export interface WaitlistMember {
  readonly position: number;
  readonly member: Member;
}

export interface WaitlistService {
  join(sessionId: string, memberId: string): Result<PositionedWaitlistEntry>;
  leave(sessionId: string, memberId: string): Result<void>;
  listForSession(sessionId: string): Result<WaitlistMember[]>;
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
      if (repos.bookings.listConfirmedForMember(memberId).some((booking) => booking.sessionId === sessionId)) {
        return err(conflict("already_booked", "the member already has a place in this session"));
      }
      if (repos.waitlist.find(sessionId, memberId)) {
        return err(conflict("already_waitlisted", "the member is already on this session's waitlist"));
      }
      if (repos.bookings.countConfirmedForSession(sessionId) < session.capacity) {
        return err(conflict("session_not_full", "the session still has places available"));
      }
      const position = repos.waitlist.listForSession(sessionId).length + 1;
      const entry: WaitlistEntry = { sessionId, memberId, joinedAt: clock.now() };
      repos.waitlist.insert(entry);
      return ok({ entry, position });
    },

    leave(sessionId, memberId) {
      if (!repos.sessions.findById(sessionId)) return err(notFound("session", sessionId));
      if (!repos.members.findById(memberId)) return err(notFound("member", memberId));
      if (!repos.waitlist.find(sessionId, memberId)) {
        return err(notFound("waitlist entry", `${sessionId}/${memberId}`));
      }
      repos.waitlist.remove(sessionId, memberId);
      return ok(undefined);
    },

    listForSession(sessionId) {
      if (!repos.sessions.findById(sessionId)) return err(notFound("session", sessionId));
      const queue = repos.waitlist.listForSession(sessionId);
      const members = new Map(
        repos.members.findManyByIds(queue.map((entry) => entry.memberId)).map((member) => [member.id, member]),
      );
      return ok(queue.flatMap((entry, index) => {
        const member = members.get(entry.memberId);
        return member ? [{ position: index + 1, member }] : [];
      }));
    },
  };
}
