import type { WaitlistEntry } from "../../domain/waitlist.ts";
import type { WaitlistRepository } from "../types.ts";

export function createMemoryWaitlistRepository(): WaitlistRepository {
  // One queue per session, front first.
  const queues = new Map<string, WaitlistEntry[]>();

  function queue(sessionId: string): WaitlistEntry[] {
    return queues.get(sessionId) ?? [];
  }

  return {
    append(entry) {
      queues.set(entry.sessionId, [...queue(entry.sessionId), entry]);
    },
    remove(sessionId, memberId) {
      queues.set(
        sessionId,
        queue(sessionId).filter((entry) => entry.memberId !== memberId),
      );
    },
    find(sessionId, memberId) {
      return queue(sessionId).find((entry) => entry.memberId === memberId);
    },
    listForSession(sessionId) {
      return [...queue(sessionId)];
    },
  };
}
