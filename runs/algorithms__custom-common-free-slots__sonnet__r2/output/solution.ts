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
  const res: [number, number][] = [];
  let cur = dayStart;
  for (const [s, e] of all) {
    if (s > cur && s - cur >= minLength) res.push([cur, s]);
    if (e > cur) cur = e;
  }
  if (dayEnd > cur && dayEnd - cur >= minLength) res.push([cur, dayEnd]);
  return res;
}
