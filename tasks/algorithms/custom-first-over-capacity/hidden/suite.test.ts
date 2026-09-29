let firstOverCapacity: (typeof import("./solution.ts"))["firstOverCapacity"];

beforeAll(async () => {
  ({ firstOverCapacity } = await import("./solution.ts"));
});

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("basic", () => {
  it("matches the worked example", () => {
    expect(
      firstOverCapacity(
        [
          [0, 5, 3],
          [4, 10, 3],
          [5, 8, 1],
        ],
        5,
      ),
    ).toBe(4);
  });
  it("returns -1 for the worked example with a larger room", () => {
    expect(
      firstOverCapacity(
        [
          [0, 5, 3],
          [4, 10, 3],
          [5, 8, 1],
        ],
        6,
      ),
    ).toBe(-1);
  });
  it("handles bookings given out of time order", () => {
    // At 10 the first two give 4, not over; at 12 the third adds 1.
    expect(
      firstOverCapacity(
        [
          [10, 20, 2],
          [0, 15, 2],
          [12, 13, 1],
        ],
        4,
      ),
    ).toBe(12);
  });
  it("detects overflow inside nested bookings", () => {
    expect(
      firstOverCapacity(
        [
          [0, 10, 1],
          [2, 8, 1],
          [4, 6, 1],
        ],
        2,
      ),
    ).toBe(4);
  });
  it("finds a later overflow after an earlier overlap stayed within capacity", () => {
    // 50: two present; 70: the 50-60 booking has gone, two present; 75: three.
    expect(
      firstOverCapacity(
        [
          [0, 100, 1],
          [50, 60, 1],
          [70, 80, 1],
          [75, 76, 1],
        ],
        2,
      ),
    ).toBe(75);
  });
  it("returns -1 when bookings never overlap", () => {
    expect(
      firstOverCapacity(
        [
          [0, 2, 5],
          [3, 4, 5],
        ],
        5,
      ),
    ).toBe(-1);
  });
});

describe("edge-cases", () => {
  it("returns -1 when there are no bookings", () => {
    expect(firstOverCapacity([], 0)).toBe(-1);
  });
  it("returns -1 when a single booking exactly fills the room", () => {
    expect(firstOverCapacity([[0, 10, 5]], 5)).toBe(-1);
  });
  it("returns the start of a single booking that is too large", () => {
    expect(firstOverCapacity([[4, 5, 10]], 9)).toBe(4);
  });
  it("treats a booking ending as another starts as not overlapping", () => {
    expect(
      firstOverCapacity(
        [
          [0, 5, 3],
          [5, 10, 3],
        ],
        3,
      ),
    ).toBe(-1);
  });
  it("lets several bookings leave before one arrives at the same instant", () => {
    expect(
      firstOverCapacity(
        [
          [0, 3, 2],
          [1, 3, 2],
          [3, 5, 4],
        ],
        4,
      ),
    ).toBe(-1);
  });
  it("returns the earliest start when capacity is zero", () => {
    expect(
      firstOverCapacity(
        [
          [7, 8, 1],
          [3, 9, 1],
        ],
        0,
      ),
    ).toBe(3);
  });
  it("counts bookings that start at the same time together", () => {
    expect(
      firstOverCapacity(
        [
          [2, 6, 1],
          [2, 6, 1],
        ],
        1,
      ),
    ).toBe(2);
  });
  it("handles times at the upper limit", () => {
    expect(
      firstOverCapacity(
        [
          [0, 1000000000, 1000],
          [999999999, 1000000000, 1],
        ],
        1000,
      ),
    ).toBe(999999999);
  });
  it("returns -1 when capacity is at its upper limit", () => {
    expect(firstOverCapacity([[0, 1, 1000]], 1000000000)).toBe(-1);
  });
  it("returns time zero when the room overflows at once", () => {
    expect(
      firstOverCapacity(
        [
          [5, 6, 1],
          [0, 1, 3],
        ],
        2,
      ),
    ).toBe(0);
  });
});

describe("performance", () => {
  it("scans 200000 bookings in under 1000 ms", () => {
    // Bookings [t, t+2) for t = 0..n-2 keep at most two people present, so a
    // room for two only overflows at n-2, where one extra booking [n-2, n-1)
    // joins the two covering bookings. Listed latest first.
    const n = 200000;
    const bookings: [number, number, number][] = [];
    for (let t = n - 2; t >= 0; t--) bookings.push([t, t + 2, 1]);
    bookings.push([n - 2, n - 1, 1]);
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = firstOverCapacity(bookings, 2);
    });
    expect(result).toBe(n - 2);
    expect(ms).toBeLessThan(1000);
  });
});
