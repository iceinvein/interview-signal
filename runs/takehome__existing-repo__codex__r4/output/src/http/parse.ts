import { validation } from "../errors.ts";
import { err, ok, type Result } from "../result.ts";

// Turns an untrusted JSON body into typed fields. Shape only: business rules
// (lengths, ranges, uniqueness) live in src/domain and src/services.

export type Body = Readonly<Record<string, unknown>>;

export function asObject(body: unknown): Result<Body> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return err(validation("body", "request body must be a JSON object"));
  }
  return ok(body as Body);
}

export function requireString(body: Body, field: string): Result<string> {
  const value = body[field];
  if (typeof value !== "string") return err(validation(field, `${field} must be a string`));
  return ok(value);
}

export function requireInteger(body: Body, field: string): Result<number> {
  const value = body[field];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return err(validation(field, `${field} must be an integer`));
  }
  return ok(value);
}

export function requireTimestamp(body: Body, field: string): Result<Date> {
  const value = body[field];
  // Offsets are required so "10:00" can never silently mean server-local time.
  if (typeof value !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return err(validation(field, `${field} must be an ISO 8601 timestamp with an offset`));
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return err(validation(field, `${field} must be an ISO 8601 timestamp with an offset`));
  }
  return ok(date);
}
