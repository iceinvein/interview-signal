let twoSum: (typeof import("./solution.ts"))["twoSum"];

beforeAll(async () => {
  ({ twoSum } = await import("./solution.ts"));
});

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("basic", () => {
  it("finds a pair in the middle", () => {
    expect(twoSum([2, 7, 11, 15], 9)).toEqual([0, 1]);
  });
  it("finds a pair that is not adjacent", () => {
    expect(twoSum([3, 2, 4], 6)).toEqual([1, 2]);
  });
  it("finds the pair at both ends", () => {
    expect(twoSum([5, 1, 2, 3, 10], 15)).toEqual([0, 4]);
  });
  it("finds the pair at the end", () => {
    expect(twoSum([1, 2, 4, 8, 16, 32], 48)).toEqual([4, 5]);
  });
  it("returns the smaller position first when the later value is smaller", () => {
    expect(twoSum([9, 1, 20], 10)).toEqual([0, 1]);
  });
});

describe("edge-cases", () => {
  it("handles the minimum length", () => {
    expect(twoSum([4, 6], 10)).toEqual([0, 1]);
  });
  it("uses two equal values at different positions", () => {
    expect(twoSum([3, 3], 6)).toEqual([0, 1]);
  });
  it("does not use one position twice", () => {
    expect(twoSum([3, 4, 3], 6)).toEqual([0, 2]);
  });
  it("handles negative values", () => {
    expect(twoSum([-3, 4, 3, 90], 0)).toEqual([0, 2]);
  });
  it("handles a negative target", () => {
    expect(twoSum([-1, -2, -3, -4, -5], -8)).toEqual([2, 4]);
  });
  it("handles zeros", () => {
    expect(twoSum([0, 4, 3, 0], 0)).toEqual([0, 3]);
  });
  it("handles values at the magnitude limit", () => {
    expect(twoSum([1000000000, -1000000000, 7], 0)).toEqual([0, 1]);
  });
  it("handles a target at the magnitude limit", () => {
    expect(twoSum([500000000, 1, 500000000], 1000000000)).toEqual([0, 2]);
  });
  it("ignores a value equal to half the target that appears once", () => {
    expect(twoSum([5, 2, 8], 10)).toEqual([1, 2]);
  });
});

describe("performance", () => {
  it("solves 100000 values in under 500 ms", () => {
    // Multiples of 4 sum to a multiple of 4, and 4k+1 or 4k+2 never make 3
    // mod 4, so the only pair summing to 3 is the final 1 and 2.
    const n = 100000;
    const nums = Array.from({ length: n - 2 }, (_, i) => 4 * i);
    nums.push(1, 2);
    let result: [number, number] | undefined;
    const ms = elapsedMs(() => {
      result = twoSum(nums, 3);
    });
    expect(result).toEqual([n - 2, n - 1]);
    expect(ms).toBeLessThan(500);
  });
});
