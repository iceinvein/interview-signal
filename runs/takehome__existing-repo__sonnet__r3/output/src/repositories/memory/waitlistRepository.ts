import type { WaitlistEntry } from "../../domain/waitlist.ts";
import type { WaitlistRepository } from "../types.ts";

export function createMemoryWaitlistRepository(): WaitlistRepository {
  // Insertion order is the queue order.
  const rows: WaitlistEntry[] = [];

  return {
    insert(entry) {
      rows.push(entry);
    },
    remove(sessionId, memberId) {
      const index = rows.findIndex((row) => row.sessionId === sessionId && row.memberId === memberId);
      if (index < 0) return false;
      rows.splice(index, 1);
      return true;
    },
    find(sessionId, memberId) {
      return rows.find((row) => row.sessionId === sessionId && row.memberId === memberId);
    },
    listForSession(sessionId) {
      return rows.filter((row) => row.sessionId === sessionId);
    },
  };
}
