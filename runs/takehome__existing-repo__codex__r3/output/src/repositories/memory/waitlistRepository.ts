import type { WaitlistEntry } from "../../domain/waitlist.ts";
import type { WaitlistRepository } from "../types.ts";

export function createMemoryWaitlistRepository(): WaitlistRepository {
  // Map preserves insertion order even when the clock gives two entries the same time.
  const rows = new Map<string, Map<string, WaitlistEntry>>();

  return {
    insert(entry) {
      let sessionRows = rows.get(entry.sessionId);
      if (!sessionRows) {
        sessionRows = new Map();
        rows.set(entry.sessionId, sessionRows);
      }
      sessionRows.set(entry.memberId, entry);
    },
    remove(sessionId, memberId) {
      rows.get(sessionId)?.delete(memberId);
    },
    find(sessionId, memberId) {
      return rows.get(sessionId)?.get(memberId);
    },
    listForSession(sessionId) {
      return [...(rows.get(sessionId)?.values() ?? [])];
    },
  };
}
