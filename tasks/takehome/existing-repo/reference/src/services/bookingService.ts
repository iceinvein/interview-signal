import { cancelBooking, type Booking } from "../domain/booking.ts";
import { toSummary, type Member, type MemberSummary } from "../domain/member.ts";
import { hasStarted, overlaps, type Session } from "../domain/session.ts";
import { conflict, notFound, type AppError } from "../errors.ts";
import { err, ok, type Result } from "../result.ts";
import type { ServiceDeps } from "./deps.ts";

export interface SessionBooking {
  readonly booking: Booking;
  readonly member: MemberSummary;
}

export interface MemberBooking {
  readonly booking: Booking;
  readonly session: Session;
}

export interface BookingService {
  book(sessionId: string, memberId: string): Result<Booking>;
  // Cancels, then offers the freed place to the waitlist.
  cancel(bookingId: string): Result<Booking>;
  // Gives any free places to waiting members, front of the queue first.
  fillFromWaitlist(session: Session): Booking[];
  listForSession(sessionId: string): Result<SessionBooking[]>;
  listForMember(memberId: string): Result<MemberBooking[]>;
}

export function createBookingService({ repos, clock, ids }: ServiceDeps): BookingService {
  // The order of these checks is part of the API: a member who already holds a
  // place is told so even when the session is also full.
  function checkCanBook(session: Session, member: Member): AppError | undefined {
    if (hasStarted(session, clock.now())) {
      return conflict("session_started", "the session has already started");
    }
    const memberBookings = repos.bookings.listConfirmedForMember(member.id);
    if (memberBookings.some((booking) => booking.sessionId === session.id)) {
      return conflict("already_booked", "the member already has a place in this session");
    }
    if (repos.bookings.countConfirmedForSession(session.id) >= session.capacity) {
      return conflict("session_full", "the session has no places left");
    }
    const otherSessions = repos.sessions.findManyByIds(memberBookings.map((booking) => booking.sessionId));
    const clash = otherSessions.find((other) => overlaps(other, session));
    if (clash) {
      return conflict("overlapping_booking", `the member is already booked into ${clash.title} at that time`);
    }
    return undefined;
  }

  function confirm(session: Session, member: Member): Booking {
    const booking: Booking = {
      id: ids("bkg"),
      sessionId: session.id,
      memberId: member.id,
      status: "confirmed",
      createdAt: clock.now(),
      cancelledAt: null,
    };
    repos.bookings.insert(booking);
    return booking;
  }

  // Waiting members go through the same rules as a direct booking. One who is
  // refused (say, since booked into a clashing class) keeps their place in the
  // queue and the next member is tried.
  function fillFromWaitlist(session: Session): Booking[] {
    const promoted: Booking[] = [];
    for (const entry of repos.waitlist.listForSession(session.id)) {
      if (repos.bookings.countConfirmedForSession(session.id) >= session.capacity) break;
      const member = repos.members.findById(entry.memberId);
      if (!member || checkCanBook(session, member)) continue;
      promoted.push(confirm(session, member));
      repos.waitlist.remove(session.id, member.id);
    }
    return promoted;
  }

  return {
    fillFromWaitlist,

    book(sessionId, memberId) {
      const member = repos.members.findById(memberId);
      if (!member) return err(notFound("member", memberId));
      const session = repos.sessions.findById(sessionId);
      if (!session) return err(notFound("session", sessionId));

      const refusal = checkCanBook(session, member);
      if (refusal) return err(refusal);

      return ok(confirm(session, member));
    },

    cancel(bookingId) {
      const booking = repos.bookings.findById(bookingId);
      if (!booking) return err(notFound("booking", bookingId));
      if (booking.status === "cancelled") {
        return err(conflict("already_cancelled", "the booking is already cancelled"));
      }
      const session = repos.sessions.findById(booking.sessionId);
      if (!session) return err(notFound("session", booking.sessionId));
      if (hasStarted(session, clock.now())) {
        return err(conflict("session_started", "bookings cannot be cancelled once the session has started"));
      }
      const cancelled = cancelBooking(booking, clock.now());
      repos.bookings.update(cancelled);
      fillFromWaitlist(session);
      return ok(cancelled);
    },

    listForSession(sessionId) {
      if (!repos.sessions.findById(sessionId)) return err(notFound("session", sessionId));
      const bookings = repos.bookings.listConfirmedForSession(sessionId);
      const members = new Map(
        repos.members.findManyByIds(bookings.map((booking) => booking.memberId)).map((m) => [m.id, m]),
      );
      return ok(
        bookings.flatMap((booking) => {
          const member = members.get(booking.memberId);
          return member ? [{ booking, member: toSummary(member) }] : [];
        }),
      );
    },

    listForMember(memberId) {
      if (!repos.members.findById(memberId)) return err(notFound("member", memberId));
      const bookings = repos.bookings.listConfirmedForMember(memberId);
      const sessions = new Map(
        repos.sessions.findManyByIds(bookings.map((booking) => booking.sessionId)).map((s) => [s.id, s]),
      );
      return ok(
        bookings
          .flatMap((booking) => {
            const session = sessions.get(booking.sessionId);
            return session ? [{ booking, session }] : [];
          })
          .sort((a, b) => a.session.startsAt.getTime() - b.session.startsAt.getTime()),
      );
    },
  };
}
