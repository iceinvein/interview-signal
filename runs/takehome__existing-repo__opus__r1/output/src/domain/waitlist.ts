export interface WaitlistEntry {
  readonly sessionId: string;
  readonly memberId: string;
  readonly joinedAt: Date;
}

// Positions are not stored: they are the 1-based index in queue order, so
// leaving the queue moves everyone behind up without rewriting rows.
export interface PositionedEntry {
  readonly entry: WaitlistEntry;
  readonly position: number;
}

export function withPositions(entries: readonly WaitlistEntry[]): PositionedEntry[] {
  return entries.map((entry, index) => ({ entry, position: index + 1 }));
}
