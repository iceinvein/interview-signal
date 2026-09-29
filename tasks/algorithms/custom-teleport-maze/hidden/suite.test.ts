let shortestTeleportPath: (typeof import("./solution.ts"))["shortestTeleportPath"];

beforeAll(async () => {
  ({ shortestTeleportPath } = await import("./solution.ts"));
});

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("basic", () => {
  it("steps straight onto an adjacent exit", () => {
    expect(shortestTeleportPath(["SE"])).toBe(1);
  });
  it("walks along a row", () => {
    expect(shortestTeleportPath(["S..E"])).toBe(3);
  });
  it("walks around walls", () => {
    expect(shortestTeleportPath(["S#.", "..#", "#.E"])).toBe(4);
  });
  it("uses a portal to cross a wall", () => {
    expect(shortestTeleportPath(["Sa#a.E"])).toBe(4);
  });
  it("chains two portals", () => {
    expect(shortestTeleportPath(["Sa#ab#bE"])).toBe(5);
  });
  it("uses a portal to reach an otherwise sealed region", () => {
    expect(shortestTeleportPath(["S.a", "###", "a.E"])).toBe(5);
  });
});

describe("edge-cases", () => {
  it("returns -1 when a wall separates start and exit", () => {
    expect(shortestTeleportPath(["S#E"])).toBe(-1);
  });
  it("returns -1 when the exit is walled in", () => {
    expect(shortestTeleportPath(["S..", "###", "#E#"])).toBe(-1);
  });
  it("returns -1 when the portal leads to another sealed region", () => {
    expect(shortestTeleportPath(["S.a", "###", "a#E"])).toBe(-1);
  });
  it("walks across a portal cell without being forced to jump", () => {
    expect(shortestTeleportPath(["S.a.E", "#####", "....a"])).toBe(4);
  });
  it("ignores a portal when walking is shorter", () => {
    expect(shortestTeleportPath(["SaE", "#.#", "#a#"])).toBe(2);
  });
  it("counts a jump as one move, not zero", () => {
    // Walking takes 6; the portal route is 1 + 1 jump + 4 = 6 as well.
    expect(shortestTeleportPath(["Sa...", "####.", "a...E"])).toBe(6);
  });
  it("prefers a portal that saves moves in a longer maze", () => {
    // Walking the corridor round the wall is 13; S to a (1), jump (2), a to E (3).
    expect(shortestTeleportPath(["Sa....", "#####.", "a.....", "E#####"])).toBe(3);
  });
  it("handles a single column", () => {
    expect(shortestTeleportPath(["S", ".", ".", "E"])).toBe(3);
  });
  it("handles twin portals next to each other", () => {
    expect(shortestTeleportPath(["Saa", "##E"])).toBe(3);
  });
  it("moves between regions through different portals", () => {
    // S to a (2), jump to (2,0) (3), walk to b at (2,2) (5), jump to (0,4) (6), step to E (7).
    expect(shortestTeleportPath(["S.a#bE", "######", "a.b###"])).toBe(7);
  });
});

describe("performance", () => {
  it("crosses a 1000 x 1000 open field in under 1000 ms", () => {
    // No walls or portals: the Manhattan distance corner to corner, 999 + 999.
    const grid = Array.from({ length: 1000 }, () => ".".repeat(1000).split(""));
    grid[0][0] = "S";
    grid[999][999] = "E";
    const rows = grid.map((row) => row.join(""));
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = shortestTeleportPath(rows);
    });
    expect(result).toBe(1998);
    expect(ms).toBeLessThan(1000);
  });
  it("follows a 1000 x 1000 serpentine corridor in under 1000 ms", () => {
    // Even rows are open; odd rows are walls with one gap, alternating right
    // and left ends, and the last row is solid. The only path runs 500 rows
    // of 999 steps plus 499 two-step gaps: 499500 + 998.
    const rows: string[] = [];
    for (let r = 0; r < 1000; r++) {
      if (r % 2 === 0) rows.push(".".repeat(1000));
      else if (r === 999) rows.push("#".repeat(1000));
      else if (r % 4 === 1) rows.push(`${"#".repeat(999)}.`);
      else rows.push(`.${"#".repeat(999)}`);
    }
    rows[0] = `S${rows[0].slice(1)}`;
    rows[998] = `E${rows[998].slice(1)}`;
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = shortestTeleportPath(rows);
    });
    expect(result).toBe(500498);
    expect(ms).toBeLessThan(1000);
  });
  it("crosses a 1000 x 1000 field split by a wall via one portal in under 1000 ms", () => {
    // Column 500 is solid wall. S (0,0) to a (999,499) is 1498, the jump is 1,
    // and a (0,501) to E (999,999) is 1497.
    const grid = Array.from({ length: 1000 }, () => ".".repeat(1000).split(""));
    for (let r = 0; r < 1000; r++) grid[r][500] = "#";
    grid[0][0] = "S";
    grid[999][999] = "E";
    grid[999][499] = "a";
    grid[0][501] = "a";
    const rows = grid.map((row) => row.join(""));
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = shortestTeleportPath(rows);
    });
    expect(result).toBe(2996);
    expect(ms).toBeLessThan(1000);
  });
});
