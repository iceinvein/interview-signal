import type { WaitlistEntry } from "../../domain/waitlist.ts";
import type { WaitlistRepository } from "../types.ts";

export function createMemoryWaitlistRepository(): WaitlistRepository {
  const rows = new Map<string, WaitlistEntry[]>();

  return {
    insert(entry) {
      const queue = rows.get(entry.sessionId) ?? [];
      queue.push(entry);
      rows.set(entry.sessionId, queue);
    },
    remove(sessionId, memberId) {
      const queue = rows.get(sessionId);
      if (!queue || !queue.some((entry) => entry.memberId === memberId)) {
        throw new Error(`remove of unknown waitlist entry ${sessionId}/${memberId}`);
      }
      rows.set(sessionId, queue.filter((entry) => entry.memberId !== memberId));
    },
    find(sessionId, memberId) {
      return rows.get(sessionId)?.find((entry) => entry.memberId === memberId);
    },
    listForSession(sessionId) {
      return [...(rows.get(sessionId) ?? [])];
    },
  };
}
