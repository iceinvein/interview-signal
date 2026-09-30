import type { WaitlistEntry } from "../../domain/waitlist.ts";
import type { WaitlistRepository } from "../types.ts";

export function createMemoryWaitlistRepository(): WaitlistRepository {
  // Keyed by session, then member. Insertion order is preserved by Map, which
  // gives "in the order they joined" for free.
  const rows = new Map<string, Map<string, WaitlistEntry>>();

  return {
    insert(entry) {
      const queue = rows.get(entry.sessionId) ?? new Map<string, WaitlistEntry>();
      queue.set(entry.memberId, entry);
      rows.set(entry.sessionId, queue);
    },
    remove(sessionId, memberId) {
      if (!rows.get(sessionId)?.delete(memberId)) {
        throw new Error(`removal of unknown waitlist entry ${sessionId}/${memberId}`);
      }
    },
    find(sessionId, memberId) {
      return rows.get(sessionId)?.get(memberId);
    },
    listForSession(sessionId) {
      return [...(rows.get(sessionId)?.values() ?? [])];
    },
  };
}
