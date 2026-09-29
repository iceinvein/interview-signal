let commonFreeSlots: (typeof import("./solution.ts"))["commonFreeSlots"];

beforeAll(async () => {
  ({ commonFreeSlots } = await import("./solution.ts"));
});

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("basic", () => {
  it("finds the gaps around two overlapping people", () => {
    expect(commonFreeSlots([[[1, 3]], [[2, 5]]], 0, 10, 1)).toEqual([
      [0, 1],
      [5, 10],
    ]);
  });
  it("matches the worked example", () => {
    expect(commonFreeSlots([[[1, 3], [8, 9]], [[2, 5]]], 0, 10, 2)).toEqual([[5, 8]]);
  });
  it("interleaves several people's busy times", () => {
    expect(commonFreeSlots([[[1, 2], [7, 8]], [[4, 5]]], 0, 10, 1)).toEqual([
      [0, 1],
      [2, 4],
      [5, 7],
      [8, 10],
    ]);
  });
  it("handles one person's intervals out of order and overlapping", () => {
    expect(commonFreeSlots([[[6, 8], [1, 4], [2, 3]]], 0, 10, 1)).toEqual([
      [0, 1],
      [4, 6],
      [8, 10],
    ]);
  });
  it("drops free intervals shorter than the minimum length", () => {
    expect(commonFreeSlots([[[2, 4], [5, 9]]], 0, 10, 2)).toEqual([[0, 2]]);
  });
});

describe("edge-cases", () => {
  it("returns the whole day when there are no people", () => {
    expect(commonFreeSlots([], 0, 10, 3)).toEqual([[0, 10]]);
  });
  it("returns nothing when the whole day is shorter than the minimum", () => {
    expect(commonFreeSlots([], 0, 5, 6)).toEqual([]);
  });
  it("returns the whole day when nobody has busy intervals", () => {
    expect(commonFreeSlots([[], []], 3, 8, 1)).toEqual([[3, 8]]);
  });
  it("leaves no free time between touching busy intervals", () => {
    expect(commonFreeSlots([[[0, 3]], [[3, 6]]], 0, 6, 1)).toEqual([]);
  });
  it("keeps a free interval whose length equals the minimum", () => {
    expect(commonFreeSlots([[[0, 2], [5, 10]]], 0, 10, 3)).toEqual([[2, 5]]);
  });
  it("drops a free interval one shorter than the minimum", () => {
    expect(commonFreeSlots([[[0, 2], [5, 10]]], 0, 10, 4)).toEqual([]);
  });
  it("clips busy intervals that cross the day boundaries", () => {
    expect(commonFreeSlots([[[0, 5], [8, 20]]], 3, 10, 1)).toEqual([[5, 8]]);
  });
  it("ignores busy intervals entirely outside the day", () => {
    expect(commonFreeSlots([[[0, 2], [12, 15]]], 4, 10, 1)).toEqual([[4, 10]]);
  });
  it("treats a busy interval ending at dayStart as outside the day", () => {
    expect(commonFreeSlots([[[0, 5]]], 5, 9, 1)).toEqual([[5, 9]]);
  });
  it("treats a busy interval starting at dayEnd as outside the day", () => {
    expect(commonFreeSlots([[[9, 12]]], 5, 9, 1)).toEqual([[5, 9]]);
  });
  it("returns nothing when someone is busy all day", () => {
    expect(commonFreeSlots([[[4, 5]], [[0, 100]]], 10, 20, 1)).toEqual([]);
  });
  it("absorbs intervals nested inside a longer one", () => {
    expect(commonFreeSlots([[[1, 9]], [[2, 3]], [[4, 5]]], 0, 10, 1)).toEqual([
      [0, 1],
      [9, 10],
    ]);
  });
  it("handles the same interval listed by two people", () => {
    expect(commonFreeSlots([[[3, 4]], [[3, 4]]], 0, 5, 1)).toEqual([
      [0, 3],
      [4, 5],
    ]);
  });
  it("handles times at the upper limit", () => {
    expect(commonFreeSlots([[[0, 999999999]]], 0, 1000000000, 1)).toEqual([[999999999, 1000000000]]);
  });
});

describe("performance", () => {
  it("handles 1000 people with 200000 intervals over a 10^9 day in under 1000 ms", () => {
    // Interval j is [5000j, 5000j + 2500), owned by person j mod 1000, so the
    // free intervals are exactly [5000j + 2500, 5000j + 5000) for j < 200000,
    // the last one ending at 10^9, each of length 2500.
    const busy: [number, number][][] = Array.from({ length: 1000 }, () => []);
    for (let j = 0; j < 200000; j++) busy[j % 1000].push([5000 * j, 5000 * j + 2500]);
    const expected: [number, number][] = [];
    for (let j = 0; j < 200000; j++) expected.push([5000 * j + 2500, 5000 * j + 5000]);
    let result: [number, number][] | undefined;
    const ms = elapsedMs(() => {
      result = commonFreeSlots(busy, 0, 1000000000, 2500);
    });
    expect(result).toEqual(expected);
    expect(ms).toBeLessThan(1000);
  });
  it("finds a single long gap among 200000 overlapping intervals in under 1000 ms", () => {
    // Person p is busy on [p, 5 * 10^8) and [5 * 10^8 + 1000 + p, 10^9) many
    // times over; everyone is free only on [5 * 10^8, 5 * 10^8 + 1000).
    const busy: [number, number][][] = Array.from({ length: 1000 }, (_, p) => {
      const own: [number, number][] = [];
      for (let k = 0; k < 100; k++) own.push([p, 500000000], [500001000 + p, 1000000000]);
      return own;
    });
    let result: [number, number][] | undefined;
    const ms = elapsedMs(() => {
      result = commonFreeSlots(busy, 0, 1000000000, 1000);
    });
    expect(result).toEqual([[500000000, 500001000]]);
    expect(ms).toBeLessThan(1000);
  });
});
