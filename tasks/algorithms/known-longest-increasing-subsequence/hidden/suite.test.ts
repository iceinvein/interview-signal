let lengthOfLIS: (typeof import("./solution.ts"))["lengthOfLIS"];

beforeAll(async () => {
  ({ lengthOfLIS } = await import("./solution.ts"));
});

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("basic", () => {
  it("skips elements that break the increase", () => {
    expect(lengthOfLIS([10, 9, 2, 5, 3, 7, 101, 18])).toBe(4);
  });
  it("picks a later smaller value to extend the run", () => {
    expect(lengthOfLIS([0, 1, 0, 3, 2, 3])).toBe(4);
  });
  it("keeps an early long run over a later short one", () => {
    expect(lengthOfLIS([1, 3, 6, 7, 9, 4, 10, 5, 6])).toBe(6);
  });
  it("finds the run through a restart at a lower value", () => {
    expect(lengthOfLIS([4, 10, 4, 3, 8, 9])).toBe(3);
  });
  it("threads through an interleaved zigzag", () => {
    expect(lengthOfLIS([1, 5, 2, 6, 3, 7])).toBe(4);
  });
  it("counts a fully increasing array", () => {
    expect(lengthOfLIS([1, 2, 3, 4, 5])).toBe(5);
  });
});

describe("edge-cases", () => {
  it("returns 1 for a single element", () => {
    expect(lengthOfLIS([5])).toBe(1);
  });
  it("returns 1 for a strictly decreasing array", () => {
    expect(lengthOfLIS([5, 4, 3, 2, 1])).toBe(1);
  });
  it("does not count equal values as increasing", () => {
    expect(lengthOfLIS([7, 7, 7, 7])).toBe(1);
  });
  it("counts a repeated value only once inside a run", () => {
    expect(lengthOfLIS([1, 2, 2, 3])).toBe(3);
  });
  it("handles two decreasing elements", () => {
    expect(lengthOfLIS([2, 1])).toBe(1);
  });
  it("handles two increasing elements", () => {
    expect(lengthOfLIS([1, 2])).toBe(2);
  });
  it("handles negative values", () => {
    expect(lengthOfLIS([-3, -1, -2, 0])).toBe(3);
  });
  it("handles values at the magnitude limit", () => {
    expect(lengthOfLIS([1000000000, -1000000000, 0])).toBe(2);
  });
  it("drops a large first value in favour of smaller later ones", () => {
    expect(lengthOfLIS([3, 1, 2])).toBe(2);
  });
});

describe("performance", () => {
  it("solves 100000 values in descending blocks in under 500 ms", () => {
    // Block b holds 100b + 99 down to 100b, so an increasing subsequence
    // takes at most one value per block and one per block is achievable.
    const nums: number[] = [];
    for (let block = 0; block < 1000; block++) {
      for (let k = 99; k >= 0; k--) nums.push(100 * block + k);
    }
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = lengthOfLIS(nums);
    });
    expect(result).toBe(1000);
    expect(ms).toBeLessThan(500);
  });
  it("solves 100000 increasing values in under 500 ms", () => {
    // Every element beats the one before, so the whole array is the answer.
    const nums = Array.from({ length: 100000 }, (_, i) => 2 * i - 100000);
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = lengthOfLIS(nums);
    });
    expect(result).toBe(100000);
    expect(ms).toBeLessThan(500);
  });
});
