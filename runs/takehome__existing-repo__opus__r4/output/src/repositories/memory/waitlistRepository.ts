import type { WaitlistEntry } from "../../domain/waitlist.ts";
import type { WaitlistRepository } from "../types.ts";

export function createMemoryWaitlistRepository(): WaitlistRepository {
  // Insertion order is preserved by Map, which gives queue order for free.
  const rows = new Map<string, WaitlistEntry>();

  function key(sessionId: string, memberId: string): string {
    return `${sessionId}/${memberId}`;
  }

  return {
    insert(entry) {
      rows.set(key(entry.sessionId, entry.memberId), entry);
    },
    delete(sessionId, memberId) {
      if (!rows.delete(key(sessionId, memberId))) {
        throw new Error(`delete of unknown waitlist entry ${sessionId}/${memberId}`);
      }
    },
    find(sessionId, memberId) {
      return rows.get(key(sessionId, memberId));
    },
    listForSession(sessionId) {
      return [...rows.values()].filter((entry) => entry.sessionId === sessionId);
    },
  };
}
