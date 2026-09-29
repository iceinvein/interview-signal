let countIslands: (typeof import("./solution.ts"))["countIslands"];

beforeAll(async () => {
  ({ countIslands } = await import("./solution.ts"));
});

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("basic", () => {
  it("counts one large irregular island", () => {
    expect(
      countIslands([
        [1, 1, 1, 1, 0],
        [1, 1, 0, 1, 0],
        [1, 1, 0, 0, 0],
        [0, 0, 0, 0, 0],
      ]),
    ).toBe(1);
  });
  it("counts several separate islands", () => {
    expect(
      countIslands([
        [1, 1, 0, 0, 0],
        [1, 1, 0, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 0, 1, 1],
      ]),
    ).toBe(3);
  });
  it("does not connect diagonal neighbours", () => {
    expect(
      countIslands([
        [1, 0],
        [0, 1],
      ]),
    ).toBe(2);
  });
  it("counts a U shape as one island", () => {
    expect(
      countIslands([
        [1, 0, 1],
        [1, 0, 1],
        [1, 1, 1],
      ]),
    ).toBe(1);
  });
  it("counts every land cell of a checkerboard separately", () => {
    expect(
      countIslands([
        [1, 0, 1],
        [0, 1, 0],
        [1, 0, 1],
      ]),
    ).toBe(5);
  });
  it("counts an island inside a lake inside a ring", () => {
    expect(
      countIslands([
        [1, 1, 1, 1, 1],
        [1, 0, 0, 0, 1],
        [1, 0, 1, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 1, 1, 1, 1],
      ]),
    ).toBe(2);
  });
});

describe("edge-cases", () => {
  it("returns 0 for a single water cell", () => {
    expect(countIslands([[0]])).toBe(0);
  });
  it("returns 1 for a single land cell", () => {
    expect(countIslands([[1]])).toBe(1);
  });
  it("returns 0 for a grid of only water", () => {
    expect(
      countIslands([
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ]),
    ).toBe(0);
  });
  it("returns 1 for a grid of only land", () => {
    expect(
      countIslands([
        [1, 1, 1],
        [1, 1, 1],
      ]),
    ).toBe(1);
  });
  it("counts islands in a single row", () => {
    expect(countIslands([[1, 0, 1, 1, 0, 1]])).toBe(3);
  });
  it("counts islands in a single column", () => {
    expect(countIslands([[1], [1], [0], [1]])).toBe(2);
  });
  it("does not connect land across the left and right edges", () => {
    expect(countIslands([[1, 0, 0, 1]])).toBe(2);
  });
  it("does not connect land across the top and bottom edges", () => {
    expect(countIslands([[1], [0], [1]])).toBe(2);
  });
  it("counts land in each corner separately", () => {
    expect(
      countIslands([
        [1, 0, 0, 1],
        [0, 0, 0, 0],
        [1, 0, 0, 1],
      ]),
    ).toBe(4);
  });
});

describe("performance", () => {
  it("counts a 1000 by 1000 grid of only land in under 1000 ms", () => {
    const grid = Array.from({ length: 1000 }, () => new Array<number>(1000).fill(1));
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = countIslands(grid);
    });
    expect(result).toBe(1);
    expect(ms).toBeLessThan(1000);
  });
  it("counts a 1000 by 1000 serpentine path as one island in under 1000 ms", () => {
    // Even rows are all land; each odd row has one land cell, alternately at the
    // right and left end, joining the rows above and below into a single path.
    const grid = Array.from({ length: 1000 }, (_, r) => {
      if (r % 2 === 0) return new Array<number>(1000).fill(1);
      const row = new Array<number>(1000).fill(0);
      row[r % 4 === 1 ? 999 : 0] = 1;
      return row;
    });
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = countIslands(grid);
    });
    expect(result).toBe(1);
    expect(ms).toBeLessThan(1000);
  });
  it("counts a 1000 by 1000 checkerboard in under 1000 ms", () => {
    // Land where r + c is even: no two land cells are orthogonal neighbours, and
    // half of the 10^6 cells are land.
    const grid = Array.from({ length: 1000 }, (_, r) =>
      Array.from({ length: 1000 }, (_, c) => ((r + c) % 2 === 0 ? 1 : 0)),
    );
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = countIslands(grid);
    });
    expect(result).toBe(500000);
    expect(ms).toBeLessThan(1000);
  });
});
