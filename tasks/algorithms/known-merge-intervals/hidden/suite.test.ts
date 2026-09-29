let mergeIntervals: (typeof import("./solution.ts"))["mergeIntervals"];

beforeAll(async () => {
  ({ mergeIntervals } = await import("./solution.ts"));
});

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("basic", () => {
  it("merges overlapping intervals and keeps separate ones", () => {
    expect(
      mergeIntervals([
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
  it("merges intervals that only touch at an end", () => {
    expect(
      mergeIntervals([
        [1, 4],
        [4, 5],
      ]),
    ).toEqual([[1, 5]]);
  });
  it("sorts unsorted input before merging", () => {
    expect(
      mergeIntervals([
        [8, 10],
        [1, 3],
        [2, 6],
      ]),
    ).toEqual([
      [1, 6],
      [8, 10],
    ]);
  });
  it("merges a chain of touching intervals into one", () => {
    expect(
      mergeIntervals([
        [3, 4],
        [1, 2],
        [2, 3],
      ]),
    ).toEqual([[1, 4]]);
  });
  it("returns disjoint intervals sorted by start", () => {
    expect(
      mergeIntervals([
        [5, 6],
        [1, 2],
      ]),
    ).toEqual([
      [1, 2],
      [5, 6],
    ]);
  });
  it("absorbs intervals contained in a larger one", () => {
    expect(
      mergeIntervals([
        [2, 3],
        [1, 10],
        [4, 5],
      ]),
    ).toEqual([[1, 10]]);
  });
});

describe("edge-cases", () => {
  it("returns an empty list for empty input", () => {
    expect(mergeIntervals([])).toEqual([]);
  });
  it("returns a single interval unchanged", () => {
    expect(mergeIntervals([[3, 7]])).toEqual([[3, 7]]);
  });
  it("keeps a single-point interval", () => {
    expect(mergeIntervals([[2, 2]])).toEqual([[2, 2]]);
  });
  it("absorbs a single-point interval at another interval's end", () => {
    expect(
      mergeIntervals([
        [1, 2],
        [2, 2],
      ]),
    ).toEqual([[1, 2]]);
  });
  it("collapses duplicate intervals", () => {
    expect(
      mergeIntervals([
        [1, 4],
        [1, 4],
      ]),
    ).toEqual([[1, 4]]);
  });
  it("does not merge integer intervals with a gap of one", () => {
    expect(
      mergeIntervals([
        [3, 4],
        [1, 2],
      ]),
    ).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });
  it("keeps the larger end when a contained interval follows", () => {
    // Sorted, [2,3] follows [1,10]; if the running end dropped to 3, [5,12] would split off.
    expect(
      mergeIntervals([
        [5, 12],
        [2, 3],
        [1, 10],
      ]),
    ).toEqual([[1, 12]]);
  });
  it("merges intervals with the same start and different ends", () => {
    expect(
      mergeIntervals([
        [1, 2],
        [1, 4],
      ]),
    ).toEqual([[1, 4]]);
  });
  it("handles values at the bounds", () => {
    expect(
      mergeIntervals([
        [1000000000, 1000000000],
        [0, 0],
      ]),
    ).toEqual([
      [0, 0],
      [1000000000, 1000000000],
    ]);
  });
  it("merges an interval spanning the whole range", () => {
    expect(
      mergeIntervals([
        [5, 6],
        [0, 1000000000],
        [999999999, 1000000000],
      ]),
    ).toEqual([[0, 1000000000]]);
  });
});

describe("performance", () => {
  it("returns 100000 disjoint scrambled intervals sorted in under 500 ms", () => {
    // 7919 is coprime with 100000, so k * 7919 mod n visits every k once; the
    // intervals [2k, 2k+1] never share a point, so the answer is all of them in order.
    const n = 100000;
    const intervals: [number, number][] = Array.from({ length: n }, (_, i) => {
      const k = (i * 7919) % n;
      return [2 * k, 2 * k + 1];
    });
    const expected: [number, number][] = Array.from({ length: n }, (_, k) => [2 * k, 2 * k + 1]);
    let result: [number, number][] | undefined;
    const ms = elapsedMs(() => {
      result = mergeIntervals(intervals);
    });
    expect(result).toEqual(expected);
    expect(ms).toBeLessThan(500);
  });
  it("merges 100000 scrambled touching intervals into one in under 500 ms", () => {
    // [k, k+1] for every k in 0..n-1 touch in a chain covering [0, n].
    const n = 100000;
    const intervals: [number, number][] = Array.from({ length: n }, (_, i) => {
      const k = (i * 7919) % n;
      return [k, k + 1];
    });
    let result: [number, number][] | undefined;
    const ms = elapsedMs(() => {
      result = mergeIntervals(intervals);
    });
    expect(result).toEqual([[0, n]]);
    expect(ms).toBeLessThan(500);
  });
});
