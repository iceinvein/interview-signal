let mergeHalfOpen: (typeof import("./solution.ts"))["mergeHalfOpen"];

beforeAll(async () => {
  ({ mergeHalfOpen } = await import("./solution.ts"));
});

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("basic", () => {
  it("merges overlapping intervals and keeps separate ones", () => {
    expect(
      mergeHalfOpen([
        [1, 3],
        [2, 6],
        [8, 10],
        [15, 18],
      ]),
    ).toEqual([
      [1, 6],
      [8, 10],
      [15, 18],
    ]);
  });
  it("does not merge intervals that only touch", () => {
    expect(
      mergeHalfOpen([
        [1, 3],
        [3, 5],
      ]),
    ).toEqual([
      [1, 3],
      [3, 5],
    ]);
  });
  it("sorts unsorted input before merging", () => {
    expect(
      mergeHalfOpen([
        [8, 10],
        [1, 3],
        [2, 6],
      ]),
    ).toEqual([
      [1, 6],
      [8, 10],
    ]);
  });
  it("merges a chain of overlapping intervals into one", () => {
    expect(
      mergeHalfOpen([
        [3, 6],
        [1, 4],
        [5, 8],
      ]),
    ).toEqual([[1, 8]]);
  });
  it("keeps a chain of touching intervals separate", () => {
    expect(
      mergeHalfOpen([
        [2, 3],
        [1, 2],
        [3, 4],
      ]),
    ).toEqual([
      [1, 2],
      [2, 3],
      [3, 4],
    ]);
  });
  it("absorbs intervals contained in a larger one", () => {
    expect(
      mergeHalfOpen([
        [2, 3],
        [1, 10],
        [4, 5],
      ]),
    ).toEqual([[1, 10]]);
  });
});

describe("empty-intervals", () => {
  it("drops a lone empty interval", () => {
    expect(mergeHalfOpen([[4, 4]])).toEqual([]);
  });
  it("returns an empty list when every interval is empty", () => {
    expect(
      mergeHalfOpen([
        [2, 2],
        [1, 1],
        [2, 2],
      ]),
    ).toEqual([]);
  });
  it("drops an empty interval inside another", () => {
    expect(
      mergeHalfOpen([
        [3, 3],
        [1, 5],
      ]),
    ).toEqual([[1, 5]]);
  });
  it("does not let an empty interval bridge two touching intervals", () => {
    expect(
      mergeHalfOpen([
        [3, 5],
        [3, 3],
        [1, 3],
      ]),
    ).toEqual([
      [1, 3],
      [3, 5],
    ]);
  });
  it("drops an empty interval at another interval's start", () => {
    expect(
      mergeHalfOpen([
        [2, 2],
        [2, 4],
      ]),
    ).toEqual([[2, 4]]);
  });
});

describe("edge-cases", () => {
  it("returns an empty list for empty input", () => {
    expect(mergeHalfOpen([])).toEqual([]);
  });
  it("returns a single interval unchanged", () => {
    expect(mergeHalfOpen([[3, 7]])).toEqual([[3, 7]]);
  });
  it("collapses duplicate intervals", () => {
    expect(
      mergeHalfOpen([
        [1, 4],
        [1, 4],
      ]),
    ).toEqual([[1, 4]]);
  });
  it("merges intervals that overlap by one unit", () => {
    expect(
      mergeHalfOpen([
        [3, 6],
        [1, 4],
      ]),
    ).toEqual([[1, 6]]);
  });
  it("keeps the larger end when a contained interval follows", () => {
    // Sorted, [2,3] follows [1,10]; if the running end dropped to 3, [5,12] would split off.
    expect(
      mergeHalfOpen([
        [5, 12],
        [2, 3],
        [1, 10],
      ]),
    ).toEqual([[1, 12]]);
  });
  it("merges intervals with the same start and different ends", () => {
    expect(
      mergeHalfOpen([
        [1, 2],
        [1, 4],
      ]),
    ).toEqual([[1, 4]]);
  });
  it("keeps a touching interval separate from a merged one", () => {
    expect(
      mergeHalfOpen([
        [5, 7],
        [2, 5],
        [1, 3],
      ]),
    ).toEqual([
      [1, 5],
      [5, 7],
    ]);
  });
  it("handles touching intervals at the value bounds", () => {
    expect(
      mergeHalfOpen([
        [999999999, 1000000000],
        [0, 999999999],
        [1000000000, 1000000000],
      ]),
    ).toEqual([
      [0, 999999999],
      [999999999, 1000000000],
    ]);
  });
});

describe("performance", () => {
  it("keeps 100000 scrambled touching intervals separate in under 500 ms", () => {
    // 7919 is coprime with 100000, so k * 7919 mod n visits every k once; the
    // intervals [k, k+1) touch but never overlap, so all of them come back in order.
    const n = 100000;
    const intervals: [number, number][] = Array.from({ length: n }, (_, i) => {
      const k = (i * 7919) % n;
      return [k, k + 1];
    });
    const expected: [number, number][] = Array.from({ length: n }, (_, k) => [k, k + 1]);
    let result: [number, number][] | undefined;
    const ms = elapsedMs(() => {
      result = mergeHalfOpen(intervals);
    });
    expect(result).toEqual(expected);
    expect(ms).toBeLessThan(500);
  });
  it("merges 100000 scrambled overlapping intervals into one in under 500 ms", () => {
    // [k, k+2) and [k+1, k+3) share [k+1, k+2), so the chain covers [0, n+1).
    const n = 100000;
    const intervals: [number, number][] = Array.from({ length: n }, (_, i) => {
      const k = (i * 7919) % n;
      return [k, k + 2];
    });
    let result: [number, number][] | undefined;
    const ms = elapsedMs(() => {
      result = mergeHalfOpen(intervals);
    });
    expect(result).toEqual([[0, n + 1]]);
    expect(ms).toBeLessThan(500);
  });
});
