import type { Booking } from "../domain/booking.ts";
import type { Member, MemberSummary } from "../domain/member.ts";
import type { Session } from "../domain/session.ts";
import type { MemberBooking, SessionBooking } from "../services/bookingService.ts";
import type { SessionWithSpots } from "../services/sessionService.ts";
import type { PositionedWaitlistEntry, WaitlistMember } from "../services/waitlistService.ts";

// JSON shapes for responses. Dates are ISO strings; ids are opaque strings.

// Full member record, including contact details. Only the /members routes may
// use this; see CONTRIBUTING.md, "Member data".
export function memberView(member: Member) {
  return { id: member.id, name: member.name, email: member.email, createdAt: member.createdAt.toISOString() };
}

export function memberSummaryView(member: MemberSummary) {
  return { id: member.id, name: member.name };
}

export function sessionView({ session, spotsLeft }: SessionWithSpots) {
  return {
    id: session.id,
    title: session.title,
    instructor: session.instructor,
    startsAt: session.startsAt.toISOString(),
    durationMinutes: session.durationMinutes,
    capacity: session.capacity,
    spotsLeft,
  };
}

export function scheduledSessionView(session: Session) {
  return sessionView({ session, spotsLeft: session.capacity });
}

export function bookingView(booking: Booking) {
  return {
    id: booking.id,
    sessionId: booking.sessionId,
    memberId: booking.memberId,
    status: booking.status,
    createdAt: booking.createdAt.toISOString(),
    cancelledAt: booking.cancelledAt?.toISOString() ?? null,
  };
}

export function sessionBookingView({ booking, member }: SessionBooking) {
  return { ...bookingView(booking), member: memberSummaryView(member) };
}

export function memberBookingView({ booking, session }: MemberBooking) {
  return {
    ...bookingView(booking),
    session: { id: session.id, title: session.title, startsAt: session.startsAt.toISOString() },
  };
}

export function waitlistEntryView({ entry, position }: PositionedWaitlistEntry) {
  return {
    sessionId: entry.sessionId,
    memberId: entry.memberId,
    position,
    joinedAt: entry.joinedAt.toISOString(),
  };
}

// This endpoint is requested for front-desk contact; it is the sole
// session-scoped view that exposes email.
export function waitlistMemberView({ entry, position, member }: WaitlistMember) {
  return { position, memberId: entry.memberId, name: member.name, email: member.email };
}
