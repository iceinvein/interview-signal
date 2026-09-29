let fewestSteadyGroups: (typeof import("./solution.ts"))["fewestSteadyGroups"];

beforeAll(async () => {
  ({ fewestSteadyGroups } = await import("./solution.ts"));
});

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("basic", () => {
  it("matches the worked example", () => {
    expect(fewestSteadyGroups([1, 5, 2, 6], 4)).toBe(2);
  });
  it("pairs up a rising sequence", () => {
    expect(fewestSteadyGroups([1, 2, 3, 4], 1)).toBe(2);
  });
  it("keeps everything in one group when the spread allows", () => {
    expect(fewestSteadyGroups([1, 2, 3, 4], 3)).toBe(1);
  });
  it("splits when a new minimum widens the spread", () => {
    expect(fewestSteadyGroups([5, 9, 1], 4)).toBe(2);
  });
  it("splits when a new maximum widens the spread", () => {
    expect(fewestSteadyGroups([5, 1, 9], 4)).toBe(2);
  });
  it("handles a group whose extremes are not at its ends", () => {
    // [4, 8, 6] has spread 4; adding 2 makes it 6, so [2, 3] starts a new group.
    expect(fewestSteadyGroups([4, 8, 6, 2, 3], 4)).toBe(2);
  });
  it("measures each new group from its own first score", () => {
    // [0, 10] then [11, 20]: 11 measured against the old minimum 0 would be too wide.
    expect(fewestSteadyGroups([0, 10, 11, 20], 10)).toBe(2);
  });
  it("handles negative scores", () => {
    expect(fewestSteadyGroups([-10, -5, 0, 5, 10], 10)).toBe(2);
  });
});

describe("edge-cases", () => {
  it("returns 0 for an empty sequence", () => {
    expect(fewestSteadyGroups([], 5)).toBe(0);
  });
  it("returns 1 for a single score", () => {
    expect(fewestSteadyGroups([5], 0)).toBe(1);
  });
  it("puts every distinct neighbour apart when the spread is zero", () => {
    expect(fewestSteadyGroups([1, 2, 3, 4], 0)).toBe(4);
  });
  it("keeps equal scores together when the spread is zero", () => {
    expect(fewestSteadyGroups([3, 3, 3], 0)).toBe(1);
  });
  it("groups runs of duplicates", () => {
    expect(fewestSteadyGroups([1, 1, 2, 2, 3, 3], 1)).toBe(2);
  });
  it("splits every alternating score when the spread is one short", () => {
    expect(fewestSteadyGroups([0, 10, 0, 10], 9)).toBe(4);
  });
  it("keeps alternating scores together when the spread is exactly enough", () => {
    expect(fewestSteadyGroups([0, 10, 0, 10], 10)).toBe(1);
  });
  it("allows the full score range at the largest spread", () => {
    expect(fewestSteadyGroups([-1000000000, 1000000000], 2000000000)).toBe(1);
  });
  it("splits the full score range when the spread is one short", () => {
    expect(fewestSteadyGroups([-1000000000, 1000000000], 1999999999)).toBe(2);
  });
});

describe("performance", () => {
  it("groups 200000 scores that form one group in under 500 ms", () => {
    // A permutation of 0..n-1 (7919 is coprime to n) has spread n-1 exactly.
    const n = 200000;
    const scores = Array.from({ length: n }, (_, i) => (i * 7919) % n);
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = fewestSteadyGroups(scores, n - 1);
    });
    expect(result).toBe(1);
    expect(ms).toBeLessThan(500);
  });
  it("groups 200000 alternating extreme scores in under 500 ms", () => {
    // Scores alternate between the two limits, whose difference is exactly the spread.
    const n = 200000;
    const scores = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? -1000000000 : 1000000000));
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = fewestSteadyGroups(scores, 2000000000);
    });
    expect(result).toBe(1);
    expect(ms).toBeLessThan(500);
  });
});
