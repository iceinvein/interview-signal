let minWindow: (typeof import("./solution.ts"))["minWindow"];

beforeAll(async () => {
  ({ minWindow } = await import("./solution.ts"));
});

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("basic", () => {
  it("finds a window in the middle of the string", () => {
    expect(minWindow("ADOBECODEBANC", "ABC")).toBe("BANC");
  });
  it("finds a window at the end of the string", () => {
    expect(minWindow("bbbbac", "ac")).toBe("ac");
  });
  it("accepts the characters of t in any order", () => {
    expect(minWindow("abc", "cba")).toBe("abc");
  });
  it("finds a single character", () => {
    expect(minWindow("bcab", "a")).toBe("a");
  });
  it("returns the whole string when s equals t", () => {
    expect(minWindow("xyz", "xyz")).toBe("xyz");
  });
});

describe("edge-cases", () => {
  it("handles single-character strings that match", () => {
    expect(minWindow("a", "a")).toBe("a");
  });
  it("returns empty when t is longer than s", () => {
    expect(minWindow("a", "aa")).toBe("");
  });
  it("returns empty when a character of t is absent from s", () => {
    expect(minWindow("abcdef", "ag")).toBe("");
  });
  it("returns empty when s holds too few copies of a repeated character", () => {
    expect(minWindow("abc", "aa")).toBe("");
  });
  it("counts repeated characters of t", () => {
    expect(minWindow("baba", "bb")).toBe("bab");
  });
  it("skips earlier windows that lack enough repeats", () => {
    expect(minWindow("aaflslflsldkalskaaa", "aaa")).toBe("aaa");
  });
  it("treats upper and lower case as different characters", () => {
    expect(minWindow("aAbBa", "AB")).toBe("AbB");
  });
  it("does not match a lower-case letter for an upper-case one", () => {
    expect(minWindow("abc", "A")).toBe("");
  });
});

describe("tie-breaks", () => {
  it("returns the earliest of several shortest windows with repeats", () => {
    // "aba", "baa" and "aab" all hold two a's and one b.
    expect(minWindow("abaab", "aab")).toBe("aba");
  });
  it("returns the earliest shortest window when the contents differ", () => {
    expect(minWindow("xbaxab", "ab")).toBe("ba");
  });
});

describe("performance", () => {
  it("solves a 100000-character s with a short t in under 500 ms", () => {
    // Only the final three characters hold a b and a c next to an a.
    const s = "a".repeat(99998) + "bc";
    let result = "";
    const ms = elapsedMs(() => {
      result = minWindow(s, "abc");
    });
    expect(result).toBe("abc");
    expect(ms).toBeLessThan(500);
  });
  it("solves a 100000-character s with a 50000-character t in under 500 ms", () => {
    // In an alternating string any 49999 characters hold only 24999 of one
    // letter, so the answer is the first 50000 characters.
    const s = "ab".repeat(50000);
    const t = "a".repeat(25000) + "b".repeat(25000);
    let result = "";
    const ms = elapsedMs(() => {
      result = minWindow(s, t);
    });
    expect(result).toBe("ab".repeat(25000));
    expect(ms).toBeLessThan(500);
  });
});
