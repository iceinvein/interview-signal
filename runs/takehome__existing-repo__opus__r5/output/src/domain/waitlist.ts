// A member queued for a place in a full session. There is no id: a member is
// on a session's waitlist at most once, so (sessionId, memberId) is the key.
// Position is not stored; it is the entry's place in join order, so removing
// an entry moves everyone behind it up without rewriting any rows.
export interface WaitlistEntry {
  readonly sessionId: string;
  readonly memberId: string;
  readonly joinedAt: Date;
}
