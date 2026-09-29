let courseOrder: (typeof import("./solution.ts"))["courseOrder"];

beforeAll(async () => {
  ({ courseOrder } = await import("./solution.ts"));
});

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("basic", () => {
  it("orders a single prerequisite first", () => {
    expect(courseOrder(2, [[1, 0]])).toEqual([0, 1]);
  });
  it("puts a higher-numbered prerequisite before its course", () => {
    expect(courseOrder(2, [[0, 1]])).toEqual([1, 0]);
  });
  it("orders courses without prerequisites by number", () => {
    expect(courseOrder(3, [])).toEqual([0, 1, 2]);
  });
  it("orders a diamond where two paths meet", () => {
    expect(
      courseOrder(4, [
        [1, 0],
        [2, 0],
        [3, 1],
        [3, 2],
      ]),
    ).toEqual([0, 1, 2, 3]);
  });
  it("returns an empty array for two courses that require each other", () => {
    expect(
      courseOrder(2, [
        [1, 0],
        [0, 1],
      ]),
    ).toEqual([]);
  });
  it("returns an empty array for a cycle of three courses", () => {
    expect(
      courseOrder(3, [
        [0, 1],
        [1, 2],
        [2, 0],
      ]),
    ).toEqual([]);
  });
});

describe("tie-breaks", () => {
  it("delays course 0 until its prerequisite and everything smaller is taken", () => {
    expect(courseOrder(4, [[0, 3]])).toEqual([1, 2, 3, 0]);
  });
  it("takes an available smaller course before a blocked chain", () => {
    expect(courseOrder(3, [[0, 2]])).toEqual([1, 2, 0]);
  });
  it("takes a newly unlocked small course before larger waiting ones", () => {
    // 0 unlocks after 3 and jumps ahead of 4 and 5; 1 and 2 wait for 5.
    expect(
      courseOrder(6, [
        [1, 5],
        [2, 5],
        [0, 3],
      ]),
    ).toEqual([3, 0, 4, 5, 1, 2]);
  });
  it("interleaves two blocked chains by the smallest available course", () => {
    expect(
      courseOrder(5, [
        [0, 4],
        [1, 3],
      ]),
    ).toEqual([2, 3, 1, 4, 0]);
  });
  it("delays a course with several prerequisites until all are taken", () => {
    expect(
      courseOrder(4, [
        [0, 3],
        [0, 2],
        [0, 1],
      ]),
    ).toEqual([1, 2, 3, 0]);
  });
});

describe("edge-cases", () => {
  it("returns the only course", () => {
    expect(courseOrder(1, [])).toEqual([0]);
  });
  it("returns an empty array for a course that requires itself", () => {
    expect(courseOrder(1, [[0, 0]])).toEqual([]);
  });
  it("returns an empty array when one course requires itself among valid ones", () => {
    expect(
      courseOrder(3, [
        [1, 0],
        [2, 2],
      ]),
    ).toEqual([]);
  });
  it("treats a repeated pair as a single prerequisite", () => {
    expect(
      courseOrder(3, [
        [1, 2],
        [1, 2],
      ]),
    ).toEqual([0, 2, 1]);
  });
  it("returns an empty array for a cycle that includes a repeated pair", () => {
    expect(
      courseOrder(2, [
        [1, 0],
        [1, 0],
        [0, 1],
      ]),
    ).toEqual([]);
  });
  it("returns an empty array, not a partial order, when only some courses are blocked", () => {
    expect(
      courseOrder(4, [
        [1, 0],
        [3, 2],
        [2, 3],
      ]),
    ).toEqual([]);
  });
});

describe("performance", () => {
  it("delays course 0 to the end of 100000 courses in under 1000 ms", () => {
    // Only course 0 has a prerequisite (99999), so 1..99999 go in number order and 0 last.
    const n = 100000;
    let result: number[] | undefined;
    const ms = elapsedMs(() => {
      result = courseOrder(n, [[0, n - 1]]);
    });
    const expected = Array.from({ length: n - 1 }, (_, i) => i + 1);
    expected.push(0);
    expect(result).toEqual(expected);
    expect(ms).toBeLessThan(1000);
  });
  it("orders a descending chain of 100000 courses in under 1000 ms", () => {
    // Course i needs course i + 1, so the only valid order is 99999 down to 0.
    const n = 100000;
    const prerequisites: [number, number][] = [];
    for (let i = 0; i < n - 1; i++) prerequisites.push([i, i + 1]);
    let result: number[] | undefined;
    const ms = elapsedMs(() => {
      result = courseOrder(n, prerequisites);
    });
    expect(result).toEqual(Array.from({ length: n }, (_, i) => n - 1 - i));
    expect(ms).toBeLessThan(1000);
  });
  it("orders 100000 courses with 200000 prerequisites in under 1000 ms", () => {
    // Course i needs i - 1 (and i / 2, earlier still), so number order is the only valid order.
    const n = 100000;
    const prerequisites: [number, number][] = [];
    for (let i = 1; i < n; i++) prerequisites.push([i, i - 1], [i, Math.floor(i / 2)]);
    prerequisites.push([n - 1, 0], [n - 1, 0]);
    let result: number[] | undefined;
    const ms = elapsedMs(() => {
      result = courseOrder(n, prerequisites);
    });
    expect(prerequisites.length).toBe(200000);
    expect(result).toEqual(Array.from({ length: n }, (_, i) => i));
    expect(ms).toBeLessThan(1000);
  });
  it("returns an empty array for 100000 courses closed into a cycle in under 1000 ms", () => {
    // The chain 0 -> 1 -> ... -> 99999 plus course 0 needing 99999 is one big cycle.
    const n = 100000;
    const prerequisites: [number, number][] = [];
    for (let i = 1; i < n; i++) prerequisites.push([i, i - 1]);
    prerequisites.push([0, n - 1]);
    let result: number[] | undefined;
    const ms = elapsedMs(() => {
      result = courseOrder(n, prerequisites);
    });
    expect(result).toEqual([]);
    expect(ms).toBeLessThan(1000);
  });
});
