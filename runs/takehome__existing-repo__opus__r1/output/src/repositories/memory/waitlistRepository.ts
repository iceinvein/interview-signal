import type { WaitlistEntry } from "../../domain/waitlist.ts";
import type { WaitlistRepository } from "../types.ts";

export function createMemoryWaitlistRepository(): WaitlistRepository {
  // Keyed by session then member; insertion order gives "queue order" for free.
  const rows = new Map<string, WaitlistEntry>();
  const key = (sessionId: string, memberId: string) => `${sessionId}\u0000${memberId}`;

  return {
    insert(entry) {
      rows.set(key(entry.sessionId, entry.memberId), entry);
    },
    remove(sessionId, memberId) {
      if (!rows.delete(key(sessionId, memberId))) {
        throw new Error(`remove of unknown waitlist entry ${sessionId}/${memberId}`);
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
