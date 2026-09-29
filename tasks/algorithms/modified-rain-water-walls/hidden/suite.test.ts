let rainWaterWithWalls: (typeof import("./solution.ts"))["rainWaterWithWalls"];

beforeAll(async () => {
  ({ rainWaterWithWalls } = await import("./solution.ts"));
});

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("basic", () => {
  it("matches the open-ended answer when both walls are zero", () => {
    expect(rainWaterWithWalls([0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1], 0, 0)).toBe(6);
  });
  it("matches the open-ended answer for a basin when both walls are zero", () => {
    expect(rainWaterWithWalls([4, 2, 0, 3, 2, 5], 0, 0)).toBe(9);
  });
  it("uses a tall left wall up to the tallest bar on the right", () => {
    expect(rainWaterWithWalls([0, 1, 0, 2], 5, 0)).toBe(5);
  });
  it("uses a tall right wall up to the tallest bar on the left", () => {
    expect(rainWaterWithWalls([2, 0, 1], 0, 4)).toBe(3);
  });
  it("fills to the lower wall when both walls are taller than every bar", () => {
    expect(rainWaterWithWalls([1, 0, 2], 3, 4)).toBe(6);
  });
  it("fills an all-zero row to the lower wall", () => {
    expect(rainWaterWithWalls([0, 0, 0], 2, 5)).toBe(6);
  });
  it("ignores walls shorter than the end bars", () => {
    expect(rainWaterWithWalls([3, 0, 1, 3], 1, 2)).toBe(5);
  });
  it("fills falling bars against a tall right wall", () => {
    expect(rainWaterWithWalls([4, 3, 2, 1], 0, 4)).toBe(6);
  });
});

describe("edge-cases", () => {
  it("returns zero for no bars even between tall walls", () => {
    expect(rainWaterWithWalls([], 5, 5)).toBe(0);
  });
  it("fills a single bar up to the lower wall", () => {
    expect(rainWaterWithWalls([2], 5, 3)).toBe(1);
  });
  it("holds nothing over a single bar when one side is open", () => {
    expect(rainWaterWithWalls([0], 0, 7)).toBe(0);
  });
  it("lets water run off an open left side", () => {
    expect(rainWaterWithWalls([0, 0, 3], 0, 10)).toBe(0);
  });
  it("lets water run off an open right side despite a tall left wall", () => {
    expect(rainWaterWithWalls([4, 3, 2, 1], 5, 0)).toBe(0);
  });
  it("holds nothing when walls equal flat bars", () => {
    expect(rainWaterWithWalls([1, 1], 1, 1)).toBe(0);
  });
  it("combines a wall on one side with a taller bar in the middle", () => {
    expect(rainWaterWithWalls([1, 5, 1], 3, 2)).toBe(3);
  });
  it("handles walls at the limit", () => {
    expect(rainWaterWithWalls([0], 100000, 100000)).toBe(100000);
  });
});

describe("performance", () => {
  it("handles 100000 zero bars between full-height walls in under 500 ms", () => {
    // Both walls are 100000 and every bar is 0, so each bar holds 100000.
    const n = 100000;
    const heights = new Array<number>(n).fill(0);
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = rainWaterWithWalls(heights, 100000, 100000);
    });
    expect(result).toBe(10000000000);
    expect(ms).toBeLessThan(500);
  });
  it("handles 100000 bars capped by a low right wall in under 500 ms", () => {
    // Bars alternate 0 and 1 with a right wall of 1: every level is 1, so
    // only the 50000 zero bars hold water, one unit each.
    const n = 100000;
    const heights = Array.from({ length: n }, (_, i) => i % 2);
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = rainWaterWithWalls(heights, 100000, 1);
    });
    expect(result).toBe(50000);
    expect(ms).toBeLessThan(500);
  });
});
