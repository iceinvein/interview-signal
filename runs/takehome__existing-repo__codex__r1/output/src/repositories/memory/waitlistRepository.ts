import type { WaitlistEntry } from "../../domain/waitlist.ts";
import type { WaitlistRepository } from "../types.ts";

export function createMemoryWaitlistRepository(): WaitlistRepository {
  const rows = new Map<string, Map<string, WaitlistEntry>>();

  return {
    insert(entry) {
      let queue = rows.get(entry.sessionId);
      if (!queue) {
        queue = new Map();
        rows.set(entry.sessionId, queue);
      }
      queue.set(entry.memberId, entry);
    },
    find(sessionId, memberId) {
      return rows.get(sessionId)?.get(memberId);
    },
    remove(sessionId, memberId) {
      rows.get(sessionId)?.delete(memberId);
    },
    listForSession(sessionId) {
      return [...(rows.get(sessionId)?.values() ?? [])];
    },
  };
}
