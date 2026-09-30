export function commonFreeSlots(
  busy: [number, number][][],
  dayStart: number,
  dayEnd: number,
  minLength: number,
): [number, number][] {
  // Clip every busy interval to the day, dropping those that fall outside it.
  const clipped: [number, number][] = [];
  for (const person of busy) {
    if (!person) continue;
    for (const [s0, e0] of person) {
      const s = Math.max(s0, dayStart);
      const e = Math.min(e0, dayEnd);
      if (s < e) clipped.push([s, e]);
    }
  }
  clipped.sort((a, b) => a[0] - b[0]);

  const result: [number, number][] = [];
  let cursor = dayStart; // earliest time not yet known to be busy
  for (const [s, e] of clipped) {
    if (s > cursor && s - cursor >= minLength) result.push([cursor, s]);
    if (e > cursor) cursor = e;
  }
  if (dayEnd > cursor && dayEnd - cursor >= minLength) result.push([cursor, dayEnd]);
  return result;
}
