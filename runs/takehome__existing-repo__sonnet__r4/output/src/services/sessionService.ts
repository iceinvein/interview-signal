import { spotsLeft } from "../domain/booking.ts";
import { hasStarted, validateCapacity, validateNewSession, type NewSession, type Session } from "../domain/session.ts";
import { conflict, notFound } from "../errors.ts";
import { andThen, err, ok, type Result } from "../result.ts";
import type { ServiceDeps } from "./deps.ts";

export interface SessionWithSpots {
  readonly session: Session;
  readonly spotsLeft: number;
}

export interface SessionService {
  schedule(input: NewSession): Result<Session>;
  get(id: string): Result<SessionWithSpots>;
  listUpcoming(): SessionWithSpots[];
  changeCapacity(id: string, capacity: number): Result<SessionWithSpots>;
}

export function createSessionService({ repos, clock, ids }: ServiceDeps): SessionService {
  function withSpots(session: Session): SessionWithSpots {
    const confirmed = repos.bookings.countConfirmedForSession(session.id);
    return { session, spotsLeft: spotsLeft(session.capacity, confirmed) };
  }

  return {
    schedule(input) {
      return andThen(validateNewSession(input, clock.now()), (valid) => {
        const session: Session = { id: ids("ses"), ...valid, createdAt: clock.now() };
        repos.sessions.insert(session);
        return ok(session);
      });
    },

    get(id) {
      const session = repos.sessions.findById(id);
      return session ? ok(withSpots(session)) : err(notFound("session", id));
    },

    listUpcoming() {
      return repos.sessions.listStartingAfter(clock.now()).map(withSpots);
    },

    changeCapacity(id, capacity) {
      const session = repos.sessions.findById(id);
      if (!session) return err(notFound("session", id));
      if (hasStarted(session, clock.now())) {
        return err(conflict("session_started", "the session has already started"));
      }
      return andThen(validateCapacity(capacity), (valid) => {
        const confirmed = repos.bookings.countConfirmedForSession(id);
        if (valid < confirmed) {
          return err(
            conflict("capacity_below_bookings", `capacity ${valid} is below the ${confirmed} confirmed bookings`),
          );
        }
        const updated: Session = { ...session, capacity: valid };
        repos.sessions.update(updated);
        return ok(withSpots(updated));
      });
    },
  };
}
