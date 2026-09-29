let rainWater: (typeof import("./solution.ts"))["rainWater"];

beforeAll(async () => {
  ({ rainWater } = await import("./solution.ts"));
});

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("basic", () => {
  it("adds up several separate pools", () => {
    expect(rainWater([0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1])).toBe(6);
  });
  it("fills a basin up to the lower of its two sides", () => {
    expect(rainWater([4, 2, 0, 3, 2, 5])).toBe(9);
  });
  it("fills a single gap between equal bars", () => {
    expect(rainWater([3, 0, 3])).toBe(3);
  });
  it("fills a wide gap between equal bars", () => {
    expect(rainWater([2, 0, 0, 2])).toBe(4);
  });
  it("caps the level at the shorter side", () => {
    expect(rainWater([5, 0, 3])).toBe(3);
  });
  it("fills over bars that are lower than both sides", () => {
    expect(rainWater([3, 1, 2, 1, 3])).toBe(5);
  });
  it("fills two pools that share a middle bar", () => {
    expect(rainWater([3, 0, 3, 0, 3])).toBe(6);
  });
});

describe("edge-cases", () => {
  it("returns zero for no bars", () => {
    expect(rainWater([])).toBe(0);
  });
  it("returns zero for a single bar", () => {
    expect(rainWater([5])).toBe(0);
  });
  it("returns zero for two bars", () => {
    expect(rainWater([2, 5])).toBe(0);
  });
  it("returns zero for rising bars", () => {
    expect(rainWater([1, 2, 3, 4])).toBe(0);
  });
  it("returns zero for falling bars", () => {
    expect(rainWater([4, 3, 2, 1])).toBe(0);
  });
  it("returns zero for a single peak", () => {
    expect(rainWater([1, 3, 1])).toBe(0);
  });
  it("returns zero for flat ground", () => {
    expect(rainWater([3, 3, 3])).toBe(0);
  });
  it("returns zero when every bar is zero", () => {
    expect(rainWater([0, 0, 0])).toBe(0);
  });
  it("lets water run off open ends", () => {
    expect(rainWater([0, 5, 0])).toBe(0);
  });
  it("fills a flat floor between bars", () => {
    expect(rainWater([4, 1, 1, 1, 4])).toBe(9);
  });
  it("handles heights at the limit", () => {
    expect(rainWater([100000, 0, 100000])).toBe(100000);
  });
});

describe("performance", () => {
  it("handles 100000 bars in under 500 ms", () => {
    // Two full-height end bars with zeros between hold 100000 over each of
    // the n - 2 middle bars.
    const n = 100000;
    const heights = new Array<number>(n).fill(0);
    heights[0] = 100000;
    heights[n - 1] = 100000;
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = rainWater(heights);
    });
    expect(result).toBe(9999800000);
    expect(ms).toBeLessThan(500);
  });
  it("handles a 100000-bar valley in under 500 ms", () => {
    // Heights fall 49999..0 then rise 0..49999, so the level everywhere is
    // 49999 and each half holds 0 + 1 + ... + 49999 = 49999 * 50000 / 2.
    const n = 100000;
    const heights = Array.from({ length: n }, (_, i) => Math.abs(2 * i - (n - 1)) >> 1);
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = rainWater(heights);
    });
    expect(result).toBe(2499950000);
    expect(ms).toBeLessThan(500);
  });
});
