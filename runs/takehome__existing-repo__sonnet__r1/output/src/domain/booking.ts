export type BookingStatus = "confirmed" | "cancelled";

export interface Booking {
  readonly id: string;
  readonly sessionId: string;
  readonly memberId: string;
  readonly status: BookingStatus;
  readonly createdAt: Date;
  readonly cancelledAt: Date | null;
}

export function cancelBooking(booking: Booking, at: Date): Booking {
  return { ...booking, status: "cancelled", cancelledAt: at };
}

export function spotsLeft(capacity: number, confirmedCount: number): number {
  return Math.max(0, capacity - confirmedCount);
}
