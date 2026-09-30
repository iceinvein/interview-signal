import type { Booking } from "../domain/booking.ts";
import type { Member, MemberSummary } from "../domain/member.ts";
import type { Session } from "../domain/session.ts";
import type { MemberBooking, SessionBooking } from "../services/bookingService.ts";
import type { SessionWithSpots } from "../services/sessionService.ts";
import type { WaitlistPlace, WaitlistRow } from "../services/waitlistService.ts";

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

export function waitlistPlaceView({ entry, position }: WaitlistPlace) {
  return {
    sessionId: entry.sessionId,
    memberId: entry.memberId,
    position,
    joinedAt: entry.joinedAt.toISOString(),
  };
}

// Member details are limited to MemberSummary; see CONTRIBUTING.md, "Member data".
export function waitlistRowView({ entry, position, member }: WaitlistRow) {
  return { position, memberId: member.id, name: member.name, joinedAt: entry.joinedAt.toISOString() };
}
