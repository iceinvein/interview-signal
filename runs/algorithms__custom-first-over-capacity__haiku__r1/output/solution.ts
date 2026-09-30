export function firstOverCapacity(bookings: [number, number, number][], capacity: number): number {
  if (bookings.length === 0) return -1;

  const events: Array<[number, number, number]> = [];

  for (const [start, end, people] of bookings) {
    events.push([start, 1, people]);
    events.push([end, 0, people]);
  }

  events.sort((a, b) => a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]);

  let occupancy = 0;

  for (const [time, type, delta] of events) {
    if (type === 0) {
      occupancy -= delta;
    } else {
      occupancy += delta;
      if (occupancy > capacity) {
        return time;
      }
    }
  }

  return -1;
}
