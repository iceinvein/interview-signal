// Every expected failure in the service is one of these. The HTTP layer maps
// `kind` to a status code in src/http/respond.ts; nothing else inspects them.
export type AppError =
  | { readonly kind: "validation"; readonly field: string; readonly message: string }
  | { readonly kind: "not_found"; readonly entity: EntityName; readonly id: string }
  | { readonly kind: "conflict"; readonly code: ConflictCode; readonly message: string };

export type EntityName = "member" | "session" | "booking" | "waitlist entry";

export type ConflictCode =
  | "email_taken"
  | "session_full"
  | "session_started"
  | "already_booked"
  | "already_waitlisted"
  | "session_not_full"
  | "already_cancelled"
  | "overlapping_booking"
  | "capacity_below_bookings";

export function validation(field: string, message: string): AppError {
  return { kind: "validation", field, message };
}

export function notFound(entity: EntityName, id: string): AppError {
  return { kind: "not_found", entity, id };
}

export function conflict(code: ConflictCode, message: string): AppError {
  return { kind: "conflict", code, message };
}
