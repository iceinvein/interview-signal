export function firstOverCapacity(bookings: [number, number, number][], capacity: number): number {
  const events: [number, number][] = [];

  for (const [start, end, people] of bookings) {
    events.push([start, people], [end, -people]);
  }

  events.sort((a, b) => a[0] - b[0]);

  let present = 0;
  let i = 0;
  while (i < events.length) {
    const time = events[i][0];
    while (i < events.length && events[i][0] === time) {
      present += events[i][1];
      i++;
    }

    if (present > capacity) return time;
  }

  return -1;
}
