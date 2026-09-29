let cheapestLevel: (typeof import("./solution.ts"))["cheapestLevel"];

beforeAll(async () => {
  ({ cheapestLevel } = await import("./solution.ts"));
});

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("basic", () => {
  it("matches the worked example", () => {
    expect(cheapestLevel([1, 2, 3, 4, 5], 2, 1)).toBe(8);
  });
  it("levels to the middle when both costs are equal", () => {
    expect(cheapestLevel([1, 2, 3], 1, 1)).toBe(2);
  });
  it("levels unsorted heights with duplicates", () => {
    expect(cheapestLevel([7, 1, 7, 3, 7], 1, 1)).toBe(10);
  });
  it("raises everything when lowering is expensive", () => {
    expect(cheapestLevel([0, 10], 1, 100)).toBe(10);
  });
  it("lowers everything when raising is expensive", () => {
    expect(cheapestLevel([0, 10], 100, 1)).toBe(10);
  });
  it("prefers raising many short columns when lowering one costs more", () => {
    // L = 10 raises three columns by 10 at cost 1; L = 0 lowers one by 10 at cost 5.
    expect(cheapestLevel([0, 0, 0, 10], 1, 5)).toBe(30);
  });
  it("prefers lowering one tall column when raising is only slightly cheaper", () => {
    // L = 0 costs 10 * 2 = 20; L = 10 costs 3 * 10 * 1 = 30.
    expect(cheapestLevel([0, 0, 0, 10], 1, 2)).toBe(20);
  });
});

describe("edge-cases", () => {
  it("costs nothing for a single column", () => {
    expect(cheapestLevel([5], 3, 4)).toBe(0);
  });
  it("costs nothing when all columns are equal", () => {
    expect(cheapestLevel([1, 1, 1], 7, 9)).toBe(0);
  });
  it("costs nothing for columns of height zero", () => {
    expect(cheapestLevel([0, 0], 1, 1)).toBe(0);
  });
  it("handles two columns with equal costs", () => {
    expect(cheapestLevel([1, 4], 1, 1)).toBe(3);
  });
  it("handles heights and costs at their limits", () => {
    expect(cheapestLevel([0, 1000000], 1000, 1000)).toBe(1000000000);
  });
  it("handles a large even count split between two heights", () => {
    // Moving from 2 to 9 changes cost by 7 * (3 * 2 - 3 * 3) = -21, so L = 9 wins.
    expect(cheapestLevel([2, 9, 2, 9, 2, 9], 2, 3)).toBe(42);
  });
  it("ignores columns already at the chosen level", () => {
    // L = 5: raise 3 by 2 at cost 1 and lower 8 by 3 at cost 1.
    expect(cheapestLevel([5, 5, 5, 3, 8], 1, 1)).toBe(5);
  });
});

describe("performance", () => {
  it("levels 200000 columns with equal costs in under 500 ms", () => {
    // Heights are a permutation of 0..n-1 (7919 is coprime to n). With equal
    // costs a median is optimal, and for 0..n-1 with n even that costs (n/2)^2.
    const n = 200000;
    const heights = Array.from({ length: n }, (_, i) => (i * 7919) % n);
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = cheapestLevel(heights, 1, 1);
    });
    expect(result).toBe(10000000000);
    expect(ms).toBeLessThan(500);
  });
  it("levels 200000 columns with asymmetric costs in under 500 ms", () => {
    // Heights 0..n-1 again. Stepping L up by one changes cost by
    // 3(L+1) - (n-1-L), which first turns positive at L = 49999, and there
    // cost is 3 * 49999 * 50000 / 2 + 150000 * 150001 / 2.
    const n = 200000;
    const heights = Array.from({ length: n }, (_, i) => (i * 7919) % n);
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = cheapestLevel(heights, 3, 1);
    });
    expect(result).toBe(15000000000);
    expect(ms).toBeLessThan(500);
  });
});
