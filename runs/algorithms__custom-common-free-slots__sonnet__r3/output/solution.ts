export function commonFreeSlots(
  busy: [number, number][][],
  dayStart: number,
  dayEnd: number,
  minLength: number,
): [number, number][] {
  const all: [number, number][] = [];
  for (const person of busy) {
    for (const [s, e] of person) {
      const cs = Math.max(s, dayStart);
      const ce = Math.min(e, dayEnd);
      if (cs < ce) all.push([cs, ce]);
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
