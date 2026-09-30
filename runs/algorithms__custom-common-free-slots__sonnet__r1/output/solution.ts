export function commonFreeSlots(
  busy: [number, number][][],
  dayStart: number,
  dayEnd: number,
  minLength: number,
): [number, number][] {
  const all: [number, number][] = [];
  for (const person of busy) {
    for (const [s, e] of person) {
      if (e <= dayStart || s >= dayEnd) continue;
      all.push([Math.max(s, dayStart), Math.min(e, dayEnd)]);
    }
  }
  all.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const result: [number, number][] = [];
  let cursor = dayStart;
  for (const [s, e] of all) {
    if (s > cursor && s - cursor >= minLength) result.push([cursor, s]);
    if (e > cursor) cursor = e;
  }
  if (dayEnd > cursor && dayEnd - cursor >= minLength) result.push([cursor, dayEnd]);
  return result;
}
