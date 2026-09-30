import type { Session } from "../../domain/session.ts";
import type { SessionRepository } from "../types.ts";

export function createMemorySessionRepository(): SessionRepository {
  const rows = new Map<string, Session>();

  return {
    insert(session) {
      rows.set(session.id, session);
    },
    update(session) {
      if (!rows.has(session.id)) {
        throw new Error(`update of unknown session ${session.id}`);
      }
      rows.set(session.id, session);
    },
    findById(id) {
      return rows.get(id);
    },
    findManyByIds(ids) {
      return ids.flatMap((id) => {
        const session = rows.get(id);
        return session ? [session] : [];
      });
    },
    listStartingAfter(at) {
      return [...rows.values()]
        .filter((session) => session.startsAt.getTime() > at.getTime())
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    },
  };
}
