let longestBalancedRun: (typeof import("./solution.ts"))["longestBalancedRun"];

beforeAll(async () => {
  ({ longestBalancedRun } = await import("./solution.ts"));
});

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("basic", () => {
  it("counts a single x and y pair", () => {
    expect(longestBalancedRun("xy")).toBe(2);
  });
  it("matches the worked example", () => {
    expect(longestBalancedRun("xxayx")).toBe(3);
  });
  it("finds a pair inside a longer unbalanced string", () => {
    expect(longestBalancedRun("xxy")).toBe(2);
  });
  it("uses the whole string when it is balanced", () => {
    expect(longestBalancedRun("xyxxyy")).toBe(6);
  });
  it("counts other characters towards the length", () => {
    expect(longestBalancedRun("axbyc")).toBe(5);
  });
  it("finds a balanced run that starts at the beginning", () => {
    expect(longestBalancedRun("yyxxxyy")).toBe(6);
  });
  it("finds a balanced run that ends at the end", () => {
    expect(longestBalancedRun("xxxxyy")).toBe(4);
  });
  it("prefers a longer run of neutral characters over a short pair", () => {
    expect(longestBalancedRun("xaaa")).toBe(3);
  });
});

describe("edge-cases", () => {
  it("returns 0 for the empty string", () => {
    expect(longestBalancedRun("")).toBe(0);
  });
  it("returns 0 for a single x", () => {
    expect(longestBalancedRun("x")).toBe(0);
  });
  it("returns 1 for a single neutral character", () => {
    expect(longestBalancedRun("a")).toBe(1);
  });
  it("returns 0 when every character is x", () => {
    expect(longestBalancedRun("xxxx")).toBe(0);
  });
  it("returns 0 when every character is y", () => {
    expect(longestBalancedRun("yyyy")).toBe(0);
  });
  it("treats a string with no x or y as balanced", () => {
    expect(longestBalancedRun("abc")).toBe(3);
  });
  it("takes the longer neutral side around a lone x", () => {
    expect(longestBalancedRun("aaxa")).toBe(2);
  });
  it("treats uppercase X and Y as neutral characters", () => {
    expect(longestBalancedRun("XYx")).toBe(2);
  });
  it("counts spaces and punctuation towards the length", () => {
    expect(longestBalancedRun(" x!y ")).toBe(5);
  });
  it("finds a run starting with y", () => {
    expect(longestBalancedRun("yxxy")).toBe(4);
  });
});

describe("performance", () => {
  it("measures a fully balanced string of 1000000 characters in under 1000 ms", () => {
    // Alternating x and y leaves every even-length prefix balanced, so the
    // whole string qualifies.
    const s = "xy".repeat(500000);
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = longestBalancedRun(s);
    });
    expect(result).toBe(1000000);
    expect(ms).toBeLessThan(1000);
  });
  it("measures 1000000 characters with only a final pair balanced in under 1000 ms", () => {
    // Every substring holds more x than y unless it has at most one x and
    // the final y, so the longest balanced run is the closing "xy".
    const s = "x".repeat(999999) + "y";
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = longestBalancedRun(s);
    });
    expect(result).toBe(2);
    expect(ms).toBeLessThan(1000);
  });
});
