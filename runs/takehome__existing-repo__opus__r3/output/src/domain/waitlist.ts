// A member queueing for a place in a full session. Position is not stored: it
// is the entry's index in the session's queue, so leaving moves everyone up.
export interface WaitlistEntry {
  readonly sessionId: string;
  readonly memberId: string;
  readonly joinedAt: Date;
}
