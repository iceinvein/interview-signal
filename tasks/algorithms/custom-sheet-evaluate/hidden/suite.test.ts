let evaluateSheet: (typeof import("./solution.ts"))["evaluateSheet"];

beforeAll(async () => {
  ({ evaluateSheet } = await import("./solution.ts"));
});

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("basic", () => {
  it("returns a literal cell's number", () => {
    expect(evaluateSheet({ A1: "5" })).toEqual({ A1: 5 });
  });
  it("reads a negative literal", () => {
    expect(evaluateSheet({ A1: "-12" })).toEqual({ A1: -12 });
  });
  it("sums a formula of literals", () => {
    expect(evaluateSheet({ A1: "=2+3" })).toEqual({ A1: 5 });
  });
  it("sums a cell referenced several times", () => {
    expect(evaluateSheet({ A1: "1", A2: "=A1+A1+A1" })).toEqual({ A1: 1, A2: 3 });
  });
  it("evaluates a diamond of shared dependencies", () => {
    expect(evaluateSheet({ A1: "=B1+C1", B1: "=D1+1", C1: "=D1+2", D1: "10" })).toEqual({
      A1: 23,
      B1: 11,
      C1: 12,
      D1: 10,
    });
  });
  it("matches the worked example", () => {
    expect(evaluateSheet({ A1: "=B1+C1", B1: "=A1", C1: "4", D1: "=C1+E1+-1" })).toEqual({
      A1: "#CYCLE",
      B1: "#CYCLE",
      C1: 4,
      D1: 3,
    });
  });
});

describe("edge-cases", () => {
  it("returns an empty object for an empty sheet", () => {
    expect(evaluateSheet({})).toEqual({});
  });
  it("counts an empty cell as zero and leaves it out of the result", () => {
    expect(evaluateSheet({ A1: "=B1+1" })).toEqual({ A1: 1 });
  });
  it("marks a cell that references itself", () => {
    expect(evaluateSheet({ A1: "=A1" })).toEqual({ A1: "#CYCLE" });
  });
  it("marks a two-cell cycle but not an unrelated cell", () => {
    expect(evaluateSheet({ A1: "=B1", B1: "=A1", C1: "7" })).toEqual({
      A1: "#CYCLE",
      B1: "#CYCLE",
      C1: 7,
    });
  });
  it("marks cells that depend on a cycle, directly or indirectly", () => {
    expect(evaluateSheet({ A1: "=B1", B1: "=A1", C1: "=A1+1", D1: "=C1", E1: "=F1+2" })).toEqual({
      A1: "#CYCLE",
      B1: "#CYCLE",
      C1: "#CYCLE",
      D1: "#CYCLE",
      E1: 2,
    });
  });
  it("marks a chain leading into a self-reference", () => {
    expect(evaluateSheet({ A1: "=A2", A2: "=A3", A3: "=A3" })).toEqual({
      A1: "#CYCLE",
      A2: "#CYCLE",
      A3: "#CYCLE",
    });
  });
  it("gives a number to a cell the cycle reads from", () => {
    expect(evaluateSheet({ A1: "=B1+C1", B1: "=A1", C1: "=D1+D1", D1: "3" })).toEqual({
      A1: "#CYCLE",
      B1: "#CYCLE",
      C1: 6,
      D1: 3,
    });
  });
  it("distinguishes cell names that share a prefix", () => {
    expect(evaluateSheet({ AB12: "3", Z9: "=AB12+AB1" })).toEqual({ AB12: 3, Z9: 3 });
  });
  it("handles multi-letter names and a negative result", () => {
    expect(evaluateSheet({ ABC123: "=XYZ999+1", XYZ999: "-5" })).toEqual({ ABC123: -4, XYZ999: -5 });
  });
  it("adds negative literals inside a formula", () => {
    expect(evaluateSheet({ A1: "=-3+-4" })).toEqual({ A1: -7 });
  });
  it("mixes literals and repeated references in one formula", () => {
    expect(evaluateSheet({ A1: "=1+B1+-1+B1", B1: "6" })).toEqual({ A1: 12, B1: 6 });
  });
  it("sums to zero without a negative zero", () => {
    expect(evaluateSheet({ A1: "=-5+5", B1: "0", C1: "=A1+B1" })).toEqual({ A1: 0, B1: 0, C1: 0 });
  });
  it("handles literals at the magnitude limit", () => {
    expect(evaluateSheet({ A1: "1000000000", B1: "=A1+A1+-1000000000+-1000000000+-1000000000" })).toEqual({
      A1: 1000000000,
      B1: -1000000000,
    });
  });
});

describe("performance", () => {
  it("evaluates a 100000-cell reference chain in under 1000 ms", () => {
    // A_k = A_(k+1) + 1 and A_100000 = 0, so A_k = 100000 - k.
    const n = 100000;
    const cells: Record<string, string> = {};
    const expected: Record<string, number> = {};
    for (let k = 1; k < n; k++) cells[`A${k}`] = `=A${k + 1}+1`;
    cells[`A${n}`] = "0";
    for (let k = 1; k <= n; k++) expected[`A${k}`] = n - k;
    let result: Record<string, number | "#CYCLE"> | undefined;
    const ms = elapsedMs(() => {
      result = evaluateSheet(cells);
    });
    expect(result).toEqual(expected);
    expect(ms).toBeLessThan(1000);
  });
  it("evaluates a 60-level ladder of doubled references in under 1000 ms", () => {
    // B_k = B_(k+1) + B_(k+1) - 5 with B_60 = 5 keeps every cell at 5, while
    // expanding the references without reuse visits 2^59 leaves.
    const cells: Record<string, string> = {};
    const expected: Record<string, number> = {};
    for (let k = 1; k < 60; k++) cells[`B${k}`] = `=B${k + 1}+B${k + 1}+-5`;
    cells.B60 = "5";
    for (let k = 1; k <= 60; k++) expected[`B${k}`] = 5;
    let result: Record<string, number | "#CYCLE"> | undefined;
    const ms = elapsedMs(() => {
      result = evaluateSheet(cells);
    });
    expect(result).toEqual(expected);
    expect(ms).toBeLessThan(1000);
  });
  it("marks a 50000-cell cycle and the 50000-cell chain feeding off it in under 1000 ms", () => {
    // C_1 .. C_50000 form one ring (C_50000 points back to C_1), and every
    // D_k reads D_(k+1), with D_50000 reading C_1, so all 100000 are cycles.
    const n = 50000;
    const cells: Record<string, string> = {};
    const expected: Record<string, "#CYCLE"> = {};
    for (let k = 1; k <= n; k++) {
      cells[`C${k}`] = `=C${k === n ? 1 : k + 1}+1`;
      cells[`D${k}`] = k === n ? "=C1" : `=D${k + 1}`;
      expected[`C${k}`] = "#CYCLE";
      expected[`D${k}`] = "#CYCLE";
    }
    let result: Record<string, number | "#CYCLE"> | undefined;
    const ms = elapsedMs(() => {
      result = evaluateSheet(cells);
    });
    expect(result).toEqual(expected);
    expect(ms).toBeLessThan(1000);
  });
});
