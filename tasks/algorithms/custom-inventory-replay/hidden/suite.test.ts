let replayInventory: (typeof import("./solution.ts"))["replayInventory"];

beforeAll(async () => {
  ({ replayInventory } = await import("./solution.ts"));
});

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("basic", () => {
  it("applies adds and removes to separate items", () => {
    expect(replayInventory(["add apple 5", "add pear 2", "remove apple 3"])).toEqual([
      ["apple", 2],
      ["pear", 2],
    ]);
  });
  it("combines repeated adds of the same item", () => {
    expect(replayInventory(["add nut 3", "add nut 4"])).toEqual([["nut", 7]]);
  });
  it("undo reverts a remove", () => {
    expect(replayInventory(["add apple 5", "remove apple 2", "undo"])).toEqual([["apple", 5]]);
  });
  it("redo re-applies the undone remove", () => {
    expect(replayInventory(["add apple 5", "remove apple 2", "undo", "redo"])).toEqual([["apple", 3]]);
  });
  it("consecutive undos walk back through the history", () => {
    expect(replayInventory(["add a 1", "add b 2", "add c 3", "undo", "undo"])).toEqual([["a", 1]]);
  });
  it("redo re-applies the most recently undone action first", () => {
    expect(replayInventory(["add a 1", "add b 2", "undo", "undo", "redo"])).toEqual([["a", 1]]);
  });
  it("repeated redos restore actions in their original order", () => {
    expect(replayInventory(["add a 1", "add b 2", "undo", "undo", "redo", "redo"])).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });
  it("matches the worked example", () => {
    expect(
      replayInventory(["add apple 5", "remove apple 2", "remove pear 1", "undo", "add pear 4", "redo"]),
    ).toEqual([
      ["apple", 5],
      ["pear", 4],
    ]);
  });
});

describe("edge-cases", () => {
  it("returns an empty list for an empty log", () => {
    expect(replayInventory([])).toEqual([]);
  });
  it("leaves out an item whose stock returns to zero", () => {
    expect(replayInventory(["add a 3", "remove a 3", "add b 1"])).toEqual([["b", 1]]);
  });
  it("rejects a remove larger than the stock", () => {
    expect(replayInventory(["add a 2", "remove a 3"])).toEqual([["a", 2]]);
  });
  it("rejects a remove of an item never added", () => {
    expect(replayInventory(["remove ghost 1", "add a 1"])).toEqual([["a", 1]]);
  });
  it("undo skips over a rejected remove", () => {
    expect(replayInventory(["add a 2", "add a 1", "remove a 5", "undo"])).toEqual([["a", 2]]);
  });
  it("a rejected remove keeps the redo history", () => {
    // After the undo the stock is 0, so the remove is rejected and the redo still applies.
    expect(replayInventory(["add a 2", "undo", "remove a 1", "redo"])).toEqual([["a", 2]]);
  });
  it("a new recorded action clears the redo history", () => {
    expect(replayInventory(["add a 5", "undo", "add b 1", "redo"])).toEqual([["b", 1]]);
  });
  it("a new recorded remove also clears the redo history", () => {
    expect(replayInventory(["add a 5", "add b 2", "undo", "remove a 1", "redo"])).toEqual([["a", 4]]);
  });
  it("undo with nothing to undo does nothing", () => {
    expect(replayInventory(["undo", "add a 1", "undo", "undo", "add b 1"])).toEqual([["b", 1]]);
  });
  it("redo with nothing to redo does nothing", () => {
    expect(replayInventory(["redo", "add a 1", "redo"])).toEqual([["a", 1]]);
  });
  it("a remove accepted only because of a redo can itself be undone", () => {
    expect(replayInventory(["add a 1", "undo", "redo", "remove a 1", "undo"])).toEqual([["a", 1]]);
  });
  it("sorts item names by character code, prefixes first", () => {
    expect(replayInventory(["add b 1", "add ab 1", "add a 1", "add ba 1"])).toEqual([
      ["a", 1],
      ["ab", 1],
      ["b", 1],
      ["ba", 1],
    ]);
  });
  it("keeps quantities beyond 32-bit range exact", () => {
    expect(replayInventory(["add a 1000000000", "add a 1000000000", "add a 1000000000"])).toEqual([
      ["a", 3000000000],
    ]);
  });
});

describe("performance", () => {
  it("replays 200000 events with long undo and redo runs in under 1000 ms", () => {
    // 100000 alternating adds (a 1, b 2), then 99998 undos leave only the
    // first two, then two redos restore the third and fourth: a 1+1, b 2+2.
    const events: string[] = [];
    for (let k = 0; k < 100000; k++) events.push(k % 2 === 0 ? "add a 1" : "add b 2");
    for (let k = 0; k < 99998; k++) events.push("undo");
    events.push("redo", "redo");
    let result: [string, number][] | undefined;
    const ms = elapsedMs(() => {
      result = replayInventory(events);
    });
    expect(result).toEqual([
      ["a", 2],
      ["b", 4],
    ]);
    expect(ms).toBeLessThan(1000);
  });
  it("replays 200000 events across many items in under 1000 ms", () => {
    // 200000 adds of 1 cycle over 1000 distinct names, so each ends at 200;
    // names are "q" plus a 3-letter base-26 code, which sorts like its index.
    const names = Array.from({ length: 1000 }, (_, i) => {
      const letter = (d: number) => String.fromCharCode(97 + d);
      return `q${letter(Math.floor(i / 676))}${letter(Math.floor(i / 26) % 26)}${letter(i % 26)}`;
    });
    const events = Array.from({ length: 200000 }, (_, k) => `add ${names[k % 1000]} 1`);
    let result: [string, number][] | undefined;
    const ms = elapsedMs(() => {
      result = replayInventory(events);
    });
    expect(result).toEqual(names.map((name) => [name, 200]));
    expect(ms).toBeLessThan(1000);
  });
});
