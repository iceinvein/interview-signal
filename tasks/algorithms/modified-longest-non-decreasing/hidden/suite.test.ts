let longestNonDecreasing: (typeof import("./solution.ts"))["longestNonDecreasing"];

beforeAll(async () => {
  ({ longestNonDecreasing } = await import("./solution.ts"));
});

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("basic", () => {
  it("matches the strict answer when all values are distinct", () => {
    expect(longestNonDecreasing([10, 9, 2, 5, 3, 7, 101, 18])).toBe(4);
  });
  it("prefers a run of later equal values over an earlier rise", () => {
    expect(longestNonDecreasing([1, 3, 3, 2, 2, 2])).toBe(4);
  });
  it("keeps repeated values that surround a larger one", () => {
    expect(longestNonDecreasing([1, 1, 2, 1, 1])).toBe(4);
  });
  it("includes a repeated value in the middle of a rise", () => {
    expect(longestNonDecreasing([3, 1, 2, 2, 1, 3])).toBe(4);
  });
  it("finds the longest among several equal-length choices", () => {
    expect(longestNonDecreasing([4, 2, 4, 2, 4])).toBe(3);
  });
  it("counts a fully increasing array", () => {
    expect(longestNonDecreasing([1, 2, 3])).toBe(3);
  });
});

describe("edge-cases", () => {
  it("returns 1 for a single element", () => {
    expect(longestNonDecreasing([5])).toBe(1);
  });
  it("counts every element when all are equal", () => {
    expect(longestNonDecreasing([2, 2, 2])).toBe(3);
  });
  it("returns 1 for a strictly decreasing array", () => {
    expect(longestNonDecreasing([5, 4, 3, 2, 1])).toBe(1);
  });
  it("counts equal neighbours in a decreasing array", () => {
    expect(longestNonDecreasing([3, 3, 2, 2, 1, 1])).toBe(2);
  });
  it("handles negative values with repeats", () => {
    expect(longestNonDecreasing([-1, -1, -2, -2, -2])).toBe(3);
  });
  it("skips a dip between equal zeros", () => {
    expect(longestNonDecreasing([0, 0, -1, 0])).toBe(3);
  });
  it("handles values at the magnitude limit", () => {
    expect(longestNonDecreasing([1000000000, -1000000000, -1000000000, 1000000000])).toBe(3);
  });
  it("handles two decreasing elements", () => {
    expect(longestNonDecreasing([2, 1])).toBe(1);
  });
});

describe("performance", () => {
  it("solves 100000 values in descending blocks of repeats in under 500 ms", () => {
    // Block b holds 10b + 9 down to 10b, each ten times. Within a
    // non-increasing block only one repeated value can be kept (10), and
    // every block's values exceed the previous block's, so 1000 * 10.
    const nums: number[] = [];
    for (let block = 0; block < 1000; block++) {
      for (let k = 9; k >= 0; k--) {
        for (let repeat = 0; repeat < 10; repeat++) nums.push(10 * block + k);
      }
    }
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = longestNonDecreasing(nums);
    });
    expect(result).toBe(10000);
    expect(ms).toBeLessThan(500);
  });
  it("solves 100000 equal values in under 500 ms", () => {
    // Equal values never break a non-decreasing run, so all of them count.
    const nums = new Array<number>(100000).fill(-7);
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = longestNonDecreasing(nums);
    });
    expect(result).toBe(100000);
    expect(ms).toBeLessThan(500);
  });
});
