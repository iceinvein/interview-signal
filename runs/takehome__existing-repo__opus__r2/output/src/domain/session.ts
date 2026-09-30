import { validation } from "../errors.ts";
import { ok, err, type Result } from "../result.ts";

export interface Session {
  readonly id: string;
  readonly title: string;
  readonly instructor: string;
  readonly startsAt: Date;
  readonly durationMinutes: number;
  readonly capacity: number;
  readonly createdAt: Date;
}

export interface NewSession {
  readonly title: string;
  readonly instructor: string;
  readonly startsAt: Date;
  readonly durationMinutes: number;
  readonly capacity: number;
}

export const CAPACITY_MIN = 1;
export const CAPACITY_MAX = 50;
export const DURATION_MIN = 15;
export const DURATION_MAX = 240;
const TITLE_MAX = 80;

export function validateNewSession(input: NewSession, now: Date): Result<NewSession> {
  const title = input.title.trim();
  if (title.length === 0) return err(validation("title", "title is required"));
  if (title.length > TITLE_MAX) {
    return err(validation("title", `title must be at most ${TITLE_MAX} characters`));
  }
  const instructor = input.instructor.trim();
  if (instructor.length === 0) return err(validation("instructor", "instructor is required"));
  if (input.startsAt.getTime() <= now.getTime()) {
    return err(validation("startsAt", "startsAt must be in the future"));
  }
  if (input.durationMinutes < DURATION_MIN || input.durationMinutes > DURATION_MAX) {
    return err(
      validation("durationMinutes", `durationMinutes must be between ${DURATION_MIN} and ${DURATION_MAX}`),
    );
  }
  const capacity = validateCapacity(input.capacity);
  if (!capacity.ok) return capacity;
  return ok({ ...input, title, instructor });
}

export function validateCapacity(capacity: number): Result<number> {
  if (!Number.isInteger(capacity) || capacity < CAPACITY_MIN || capacity > CAPACITY_MAX) {
    return err(validation("capacity", `capacity must be an integer between ${CAPACITY_MIN} and ${CAPACITY_MAX}`));
  }
  return ok(capacity);
}

export function endsAt(session: Session): Date {
  return new Date(session.startsAt.getTime() + session.durationMinutes * 60_000);
}

export function hasStarted(session: Session, now: Date): boolean {
  return session.startsAt.getTime() <= now.getTime();
}

// Back-to-back sessions (one ends as the next starts) do not overlap.
export function overlaps(a: Session, b: Session): boolean {
  return a.startsAt.getTime() < endsAt(b).getTime() && b.startsAt.getTime() < endsAt(a).getTime();
}
