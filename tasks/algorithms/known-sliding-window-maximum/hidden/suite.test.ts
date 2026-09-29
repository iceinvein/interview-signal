let maxSlidingWindow: (typeof import("./solution.ts"))["maxSlidingWindow"];

beforeAll(async () => {
  ({ maxSlidingWindow } = await import("./solution.ts"));
});

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("basic", () => {
  it("returns the maximum of each window of three", () => {
    expect(maxSlidingWindow([1, 3, -1, -3, 5, 3, 6, 7], 3)).toEqual([3, 3, 5, 5, 6, 7]);
  });
  it("tracks a decreasing array", () => {
    expect(maxSlidingWindow([5, 4, 3, 2, 1], 2)).toEqual([5, 4, 3, 2]);
  });
  it("tracks an increasing array", () => {
    expect(maxSlidingWindow([1, 2, 3, 4, 5], 2)).toEqual([2, 3, 4, 5]);
  });
  it("drops the maximum once it leaves the window", () => {
    expect(maxSlidingWindow([9, 1, 1, 1, 2], 3)).toEqual([9, 1, 2]);
  });
});

describe("edge-cases", () => {
  it("handles a single element", () => {
    expect(maxSlidingWindow([1], 1)).toEqual([1]);
  });
  it("returns every element when the window size is one", () => {
    expect(maxSlidingWindow([4, -2, 7], 1)).toEqual([4, -2, 7]);
  });
  it("returns one value when the window covers the whole array", () => {
    expect(maxSlidingWindow([2, 9, 4], 3)).toEqual([9]);
  });
  it("handles all-equal values", () => {
    expect(maxSlidingWindow([7, 7, 7, 7], 2)).toEqual([7, 7, 7]);
  });
  it("keeps an equal maximum when an earlier copy leaves", () => {
    expect(maxSlidingWindow([3, 1, 3, 1, 1], 3)).toEqual([3, 3, 3]);
  });
  it("handles all-negative values", () => {
    expect(maxSlidingWindow([-5, -1, -3, -4], 2)).toEqual([-1, -1, -3]);
  });
  it("handles zeros", () => {
    expect(maxSlidingWindow([0, 0, 1], 2)).toEqual([0, 1]);
  });
  it("handles values at the magnitude limit with a window of one", () => {
    expect(maxSlidingWindow([10000, -10000], 1)).toEqual([10000, -10000]);
  });
  it("handles values at the magnitude limit with a window of two", () => {
    expect(maxSlidingWindow([-10000, -10000, 10000], 2)).toEqual([-10000, 10000]);
  });
});

describe("performance", () => {
  it("solves a decreasing 100000-element array with k = 50000 in under 500 ms", () => {
    // The array never increases, so each window's maximum is its first element.
    const n = 100000;
    const k = 50000;
    const nums = Array.from({ length: n }, (_, i) => 10000 - Math.floor(i / 5));
    const expected = Array.from({ length: n - k + 1 }, (_, i) => 10000 - Math.floor(i / 5));
    let result: number[] = [];
    const ms = elapsedMs(() => {
      result = maxSlidingWindow(nums, k);
    });
    expect(result).toEqual(expected);
    expect(ms).toBeLessThan(500);
  });
  it("solves an increasing 100000-element array with k = 50000 in under 500 ms", () => {
    // The array never decreases, so each window's maximum is its last element.
    const n = 100000;
    const k = 50000;
    const nums = Array.from({ length: n }, (_, i) => Math.floor(i / 5) - 10000);
    const expected = Array.from({ length: n - k + 1 }, (_, i) => Math.floor((i + k - 1) / 5) - 10000);
    let result: number[] = [];
    const ms = elapsedMs(() => {
      result = maxSlidingWindow(nums, k);
    });
    expect(result).toEqual(expected);
    expect(ms).toBeLessThan(500);
  });
});
