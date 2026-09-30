export function commonFreeSlots(
  busy: [number, number][][],
  dayStart: number,
  dayEnd: number,
  minLength: number,
): [number, number][] {
  // Collect busy intervals clipped to the day.
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

  const result: [number, number][] = [];
  let cursor = dayStart; // earliest time not yet known to be busy
  for (let k = 0; k < n; k++) {
    const i = order[k];
    const s = starts[i];
    const e = ends[i];
    if (s > cursor) {
      if (s - cursor >= minLength) result.push([cursor, s]);
      cursor = e;
    } else if (e > cursor) {
      cursor = e;
    }
  }
  if (dayEnd > cursor && dayEnd - cursor >= minLength) {
    result.push([cursor, dayEnd]);
  }
  return result;
}
