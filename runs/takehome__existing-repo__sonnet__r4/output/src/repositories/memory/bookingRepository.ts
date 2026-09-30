import type { Booking } from "../../domain/booking.ts";
import type { BookingRepository } from "../types.ts";

export function createMemoryBookingRepository(): BookingRepository {
  // Insertion order is preserved by Map, which gives "oldest first" for free.
  const rows = new Map<string, Booking>();

  function confirmed(predicate: (booking: Booking) => boolean): Booking[] {
    return [...rows.values()].filter((booking) => booking.status === "confirmed" && predicate(booking));
  }

  return {
    insert(booking) {
      rows.set(booking.id, booking);
    },
    update(booking) {
      if (!rows.has(booking.id)) {
        throw new Error(`update of unknown booking ${booking.id}`);
      }
      rows.set(booking.id, booking);
    },
    findById(id) {
      return rows.get(id);
    },
    listConfirmedForSession(sessionId) {
      return confirmed((booking) => booking.sessionId === sessionId);
    },
    listConfirmedForMember(memberId) {
      return confirmed((booking) => booking.memberId === memberId);
    },
    countConfirmedForSession(sessionId) {
      return confirmed((booking) => booking.sessionId === sessionId).length;
    },
  };
}
