export function firstOverCapacity(bookings: [number, number, number][], capacity: number): number {
  const events: [number, number, number][] = [];

  for (const [start, end, people] of bookings) {
    events.push([start, 1, people]);  // start event (type 1)
    events.push([end, 0, people]);     // end event (type 0)
  }

  // Sort by time, then by type (0 before 1, so ends before starts at the same time)
  events.sort((a, b) => {
    if (a[0] !== b[0]) return a[0] - b[0];
    return a[1] - b[1];
  });

  let currentCount = 0;
  let i = 0;

  while (i < events.length) {
    const currentTime = events[i][0];

    // Process all events at currentTime (ends first, then starts)
    while (i < events.length && events[i][0] === currentTime) {
      const [_, type, people] = events[i];
      if (type === 0) {
        currentCount -= people;  // end event
      } else {
        currentCount += people;  // start event
      }
      i++;
    }

    // Check if we exceeded capacity at this time
    if (currentCount > capacity) {
      return currentTime;
    }
  }

  return -1;
}
