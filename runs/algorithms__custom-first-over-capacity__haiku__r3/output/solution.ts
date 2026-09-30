export function firstOverCapacity(bookings: [number, number, number][], capacity: number): number {
  const events: Array<[number, number, number]> = [];

  for (const [start, end, people] of bookings) {
    events.push([start, 1, people]); // 1 for start event
    events.push([end, 0, people]);   // 0 for end event
  }

  // Sort by time, then by event type (ends before starts at same time)
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  let occupancy = 0;
  let i = 0;

  while (i < events.length) {
    const currentTime = events[i][0];

    // Process all events at the current time
    while (i < events.length && events[i][0] === currentTime) {
      if (events[i][1] === 0) {
        occupancy -= events[i][2];
      } else {
        occupancy += events[i][2];
      }
      i++;
    }

    // Check if we've exceeded capacity
    if (occupancy > capacity) {
      return currentTime;
    }
  }

  return -1;
}
