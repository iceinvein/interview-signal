let canFinish: (typeof import("./solution.ts"))["canFinish"];

beforeAll(async () => {
  ({ canFinish } = await import("./solution.ts"));
});

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("basic", () => {
  it("allows a single prerequisite", () => {
    expect(canFinish(2, [[1, 0]])).toBe(true);
  });
  it("rejects two courses that require each other", () => {
    expect(
      canFinish(2, [
        [1, 0],
        [0, 1],
      ]),
    ).toBe(false);
  });
  it("allows a chain of prerequisites", () => {
    expect(
      canFinish(4, [
        [1, 0],
        [2, 1],
        [3, 2],
      ]),
    ).toBe(true);
  });
  it("rejects a cycle of three courses", () => {
    expect(
      canFinish(3, [
        [0, 1],
        [1, 2],
        [2, 0],
      ]),
    ).toBe(false);
  });
  it("allows a diamond where two paths meet", () => {
    expect(
      canFinish(4, [
        [1, 0],
        [2, 0],
        [3, 1],
        [3, 2],
      ]),
    ).toBe(true);
  });
  it("rejects a cycle in one part while another part is fine", () => {
    expect(
      canFinish(5, [
        [1, 0],
        [3, 2],
        [4, 3],
        [2, 4],
      ]),
    ).toBe(false);
  });
  it("rejects a cycle reachable from a course with no prerequisites", () => {
    expect(
      canFinish(4, [
        [1, 0],
        [2, 1],
        [3, 2],
        [1, 3],
      ]),
    ).toBe(false);
  });
});

describe("edge-cases", () => {
  it("allows a single course with no prerequisites", () => {
    expect(canFinish(1, [])).toBe(true);
  });
  it("allows several courses with no prerequisites", () => {
    expect(canFinish(3, [])).toBe(true);
  });
  it("rejects a course that requires itself", () => {
    expect(canFinish(1, [[0, 0]])).toBe(false);
  });
  it("rejects a self-requiring course among valid ones", () => {
    expect(
      canFinish(3, [
        [1, 0],
        [2, 2],
      ]),
    ).toBe(false);
  });
  it("allows a repeated pair", () => {
    expect(
      canFinish(2, [
        [1, 0],
        [1, 0],
      ]),
    ).toBe(true);
  });
  it("rejects a cycle that includes a repeated pair", () => {
    expect(
      canFinish(2, [
        [1, 0],
        [1, 0],
        [0, 1],
      ]),
    ).toBe(false);
  });
  it("allows a course with several prerequisites", () => {
    expect(
      canFinish(4, [
        [3, 0],
        [3, 1],
        [3, 2],
      ]),
    ).toBe(true);
  });
  it("allows a course that several courses depend on", () => {
    expect(
      canFinish(4, [
        [1, 0],
        [2, 0],
        [3, 0],
      ]),
    ).toBe(true);
  });
  it("allows a prerequisite with a higher number than its course", () => {
    expect(
      canFinish(3, [
        [0, 2],
        [1, 0],
      ]),
    ).toBe(true);
  });
});

describe("performance", () => {
  it("allows a chain of 100000 courses in under 1000 ms", () => {
    // Course i needs course i - 1, so taking them in number order works.
    const n = 100000;
    const prerequisites: [number, number][] = [];
    for (let i = 1; i < n; i++) prerequisites.push([i, i - 1]);
    let result: boolean | undefined;
    const ms = elapsedMs(() => {
      result = canFinish(n, prerequisites);
    });
    expect(result).toBe(true);
    expect(ms).toBeLessThan(1000);
  });
  it("rejects a chain of 100000 courses closed into a cycle in under 1000 ms", () => {
    // The chain 0 -> 1 -> ... -> 99999 plus course 0 needing 99999 is one big cycle.
    const n = 100000;
    const prerequisites: [number, number][] = [];
    for (let i = 1; i < n; i++) prerequisites.push([i, i - 1]);
    prerequisites.push([0, n - 1]);
    let result: boolean | undefined;
    const ms = elapsedMs(() => {
      result = canFinish(n, prerequisites);
    });
    expect(result).toBe(false);
    expect(ms).toBeLessThan(1000);
  });
  it("allows 100000 courses with 200000 prerequisites in under 1000 ms", () => {
    // Every prerequisite has a smaller number than its course, so number order works.
    const n = 100000;
    const prerequisites: [number, number][] = [];
    for (let i = 1; i < n; i++) prerequisites.push([i, i - 1], [i, Math.floor(i / 2)]);
    prerequisites.push([n - 1, 0], [n - 1, 0]);
    let result: boolean | undefined;
    const ms = elapsedMs(() => {
      result = canFinish(n, prerequisites);
    });
    expect(prerequisites.length).toBe(200000);
    expect(result).toBe(true);
    expect(ms).toBeLessThan(1000);
  });
});
