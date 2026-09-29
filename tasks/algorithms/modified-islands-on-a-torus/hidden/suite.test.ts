let countIslandsTorus: (typeof import("./solution.ts"))["countIslandsTorus"];

beforeAll(async () => {
  ({ countIslandsTorus } = await import("./solution.ts"));
});

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("basic", () => {
  it("counts islands that do not reach across an edge", () => {
    expect(
      countIslandsTorus([
        [1, 1, 0, 0, 0],
        [1, 1, 0, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 0, 1, 1],
      ]),
    ).toBe(3);
  });
  it("joins land in the first and last columns", () => {
    expect(countIslandsTorus([[1, 0, 1]])).toBe(1);
  });
  it("joins land in the first and last rows", () => {
    expect(countIslandsTorus([[1], [0], [1]])).toBe(1);
  });
  it("joins all four corners into one island", () => {
    expect(
      countIslandsTorus([
        [1, 0, 0, 1],
        [0, 0, 0, 0],
        [1, 0, 0, 1],
      ]),
    ).toBe(1);
  });
  it("joins two shapes through the top and bottom edges", () => {
    expect(
      countIslandsTorus([
        [1, 1, 0],
        [0, 0, 0],
        [0, 1, 1],
      ]),
    ).toBe(1);
  });
  it("does not join cells that are diagonal across the wrap", () => {
    expect(
      countIslandsTorus([
        [0, 0, 1],
        [0, 0, 0],
        [1, 0, 0],
      ]),
    ).toBe(2);
  });
  it("joins the corners of an odd checkerboard but not the centre", () => {
    expect(
      countIslandsTorus([
        [1, 0, 1],
        [0, 1, 0],
        [1, 0, 1],
      ]),
    ).toBe(2);
  });
  it("keeps an even checkerboard separate across the wrap", () => {
    expect(
      countIslandsTorus([
        [1, 0, 1, 0],
        [0, 1, 0, 1],
        [1, 0, 1, 0],
        [0, 1, 0, 1],
      ]),
    ).toBe(8);
  });
  it("counts an island inside a lake inside a ring", () => {
    expect(
      countIslandsTorus([
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
    expect(countIslandsTorus([[0]])).toBe(0);
  });
  it("returns 1 for a single land cell, its own neighbour", () => {
    expect(countIslandsTorus([[1]])).toBe(1);
  });
  it("returns 0 for a grid of only water", () => {
    expect(
      countIslandsTorus([
        [0, 0, 0],
        [0, 0, 0],
      ]),
    ).toBe(0);
  });
  it("returns 1 for a grid of only land", () => {
    expect(
      countIslandsTorus([
        [1, 1, 1],
        [1, 1, 1],
      ]),
    ).toBe(1);
  });
  it("wraps a single row around its ends", () => {
    expect(countIslandsTorus([[1, 1, 0, 1, 0, 1]])).toBe(2);
  });
  it("counts one land cell in a two-cell row once", () => {
    expect(countIslandsTorus([[1, 0]])).toBe(1);
  });
  it("counts a two-cell row of land once", () => {
    expect(countIslandsTorus([[1, 1]])).toBe(1);
  });
  it("keeps separate islands in a single column when water sits at both ends of the gap", () => {
    expect(countIslandsTorus([[1], [1], [0], [1], [0]])).toBe(2);
  });
  it("wraps a single column around its ends", () => {
    expect(countIslandsTorus([[1], [0], [1], [1]])).toBe(1);
  });
});

describe("performance", () => {
  it("counts a 1000 by 1000 grid of only land in under 1000 ms", () => {
    const grid = Array.from({ length: 1000 }, () => new Array<number>(1000).fill(1));
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = countIslandsTorus(grid);
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
      result = countIslandsTorus(grid);
    });
    expect(result).toBe(1);
    expect(ms).toBeLessThan(1000);
  });
  it("counts a 1000 by 1000 checkerboard in under 1000 ms", () => {
    // Land where r + c is even; with an even width and height the wrapped
    // neighbour of a land cell has odd r + c, so every land cell stands alone.
    const grid = Array.from({ length: 1000 }, (_, r) =>
      Array.from({ length: 1000 }, (_, c) => ((r + c) % 2 === 0 ? 1 : 0)),
    );
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = countIslandsTorus(grid);
    });
    expect(result).toBe(500000);
    expect(ms).toBeLessThan(1000);
  });
  it("joins the first and last columns of a 1000 by 1000 grid in under 1000 ms", () => {
    const grid = Array.from({ length: 1000 }, () => {
      const row = new Array<number>(1000).fill(0);
      row[0] = 1;
      row[999] = 1;
      return row;
    });
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = countIslandsTorus(grid);
    });
    expect(result).toBe(1);
    expect(ms).toBeLessThan(1000);
  });
});
