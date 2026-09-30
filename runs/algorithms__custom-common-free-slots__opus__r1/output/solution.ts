export function commonFreeSlots(
  busy: [number, number][][],
  dayStart: number,
  dayEnd: number,
  minLength: number,
): [number, number][] {
  // Clip every busy interval to the day and drop empty ones.
  const starts: number[] = [];
  const ends: number[] = [];
  for (const person of busy) {
    if (!person) continue;
    for (const iv of person) {
      const s = Math.max(iv[0], dayStart);
      const e = Math.min(iv[1], dayEnd);
      if (s < e) {
        starts.push(s);
        ends.push(e);
      }
    }
  }

  const n = starts.length;
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((a, b) => starts[a] - starts[b]);

  // Sweep: `cur` is the earliest time not yet known to be busy.
  const result: [number, number][] = [];
  let cur = dayStart;
  for (let k = 0; k < n; k++) {
    const i = order[k];
    const s = starts[i];
    if (s > cur && s - cur >= minLength) result.push([cur, s]);
    if (ends[i] > cur) cur = ends[i];
  }
  if (dayEnd > cur && dayEnd - cur >= minLength) result.push([cur, dayEnd]);
  return result;
}
