let serveCustomers: (typeof import("./solution.ts"))["serveCustomers"];

beforeAll(async () => {
  ({ serveCustomers } = await import("./solution.ts"));
});

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("basic", () => {
  it("matches the worked example", () => {
    expect(serveCustomers([0, 0, 0, 0], [10, 1, 1, 1], 2)).toEqual([10, 1, 2, 3]);
  });
  it("sends the third customer to the server that frees first", () => {
    expect(serveCustomers([0, 0, 0], [5, 3, 2], 2)).toEqual([5, 3, 5]);
  });
  it("queues customers behind a single server", () => {
    expect(serveCustomers([1, 2, 10], [3, 3, 1], 1)).toEqual([4, 7, 11]);
  });
  it("starts service at the arrival time when a server is already idle", () => {
    expect(serveCustomers([0, 100], [5, 5], 2)).toEqual([5, 105]);
  });
  it("chains customers who arrive together at one server", () => {
    expect(serveCustomers([3, 3, 3], [2, 2, 2], 1)).toEqual([5, 7, 9]);
  });
  it("serves customers in index order even when both servers are busy", () => {
    expect(serveCustomers([0, 0, 1, 1], [10, 10, 1, 1], 2)).toEqual([10, 10, 11, 11]);
  });
  it("mixes waiting and idle servers over time", () => {
    // Server A: c0 0-4, c2 4-6. Server B: c1 1-7. c3 arrives at 8, both idle.
    expect(serveCustomers([0, 1, 2, 8], [4, 6, 2, 1], 2)).toEqual([4, 7, 6, 9]);
  });
});

describe("edge-cases", () => {
  it("returns an empty array when there are no customers", () => {
    expect(serveCustomers([], [], 3)).toEqual([]);
  });
  it("serves a single customer", () => {
    expect(serveCustomers([7], [2], 1)).toEqual([9]);
  });
  it("handles more servers than customers", () => {
    expect(serveCustomers([2, 4], [10, 1], 5)).toEqual([12, 5]);
  });
  it("finishes a zero-duration customer at the start time", () => {
    expect(serveCustomers([0, 0], [0, 4], 1)).toEqual([0, 4]);
  });
  it("lets a server freed at the arrival instant start at once", () => {
    expect(serveCustomers([0, 5], [5, 1], 1)).toEqual([5, 6]);
  });
  it("handles times at the magnitude limit", () => {
    expect(serveCustomers([1000000000, 1000000000], [1000000000, 1000000000], 1)).toEqual([
      2000000000, 3000000000,
    ]);
  });
  it("handles all arrivals at time zero with zero durations", () => {
    expect(serveCustomers([0, 0, 0], [0, 0, 0], 1)).toEqual([0, 0, 0]);
  });
  it("reuses the earliest server after an idle gap", () => {
    // After the gap both servers are free; c2 and c3 each start on arrival.
    expect(serveCustomers([0, 0, 50, 50], [3, 9, 1, 1], 2)).toEqual([3, 9, 51, 51]);
  });
});

describe("performance", () => {
  it("serves 200000 customers on 100000 servers in under 1000 ms", () => {
    // Everyone arrives at 0. The first S customers take one server each and
    // free them at times S, S-1, ..., 1. Customer S+k then takes the server
    // freed at k+1 and, needing S units, finishes at k+1+S, later than every
    // first-wave free time, so the second wave never reuses its own servers.
    const servers = 100000;
    const n = 2 * servers;
    const arrivals = new Array<number>(n).fill(0);
    const durations = Array.from({ length: n }, (_, i) => (i < servers ? servers - i : servers));
    const expected = Array.from({ length: n }, (_, i) => (i < servers ? servers - i : i + 1));
    let result: number[] | undefined;
    const ms = elapsedMs(() => {
      result = serveCustomers(arrivals, durations, servers);
    });
    expect(result).toEqual(expected);
    expect(ms).toBeLessThan(1000);
  });
});
