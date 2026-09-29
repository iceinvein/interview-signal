let minWindowSubsequence: (typeof import("./solution.ts"))["minWindowSubsequence"];

beforeAll(async () => {
  ({ minWindowSubsequence } = await import("./solution.ts"));
});

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("basic", () => {
  it("finds a window with gaps between the characters", () => {
    expect(minWindowSubsequence("axbxc", "abc")).toBe("axbxc");
  });
  it("prefers a later window that is shorter", () => {
    expect(minWindowSubsequence("axxxbyab", "ab")).toBe("ab");
  });
  it("starts the window at the last usable copy of the first character", () => {
    expect(minWindowSubsequence("aabc", "abc")).toBe("abc");
  });
  it("finds a later exact match over an earlier gapped one", () => {
    expect(minWindowSubsequence("abbcabc", "abc")).toBe("abc");
  });
  it("returns the whole string when s equals t", () => {
    expect(minWindowSubsequence("xyz", "xyz")).toBe("xyz");
  });
});

describe("edge-cases", () => {
  it("handles single-character strings that match", () => {
    expect(minWindowSubsequence("a", "a")).toBe("a");
  });
  it("returns empty when a character of t is absent from s", () => {
    expect(minWindowSubsequence("abc", "d")).toBe("");
  });
  it("returns empty when t is longer than s", () => {
    expect(minWindowSubsequence("ab", "abc")).toBe("");
  });
  it("returns empty when the characters appear only in the wrong order", () => {
    expect(minWindowSubsequence("ab", "ba")).toBe("");
  });
  it("respects order when choosing among copies", () => {
    expect(minWindowSubsequence("abcab", "ba")).toBe("bca");
  });
  it("matches repeated characters of t to distinct positions", () => {
    expect(minWindowSubsequence("aaa", "aa")).toBe("aa");
  });
  it("spans the whole string when the repeats sit at both ends", () => {
    expect(minWindowSubsequence("abcbca", "aa")).toBe("abcbca");
  });
});

describe("tie-breaks", () => {
  it("returns the earliest of two shortest windows (known example)", () => {
    // "bcde" and "bdde" both have length 4.
    expect(minWindowSubsequence("abcdebdde", "bde")).toBe("bcde");
  });
  it("returns the earliest shortest window when the contents differ", () => {
    expect(minWindowSubsequence("acbxadb", "ab")).toBe("acb");
  });
  it("returns the earliest shortest window for repeated characters", () => {
    // "abaca" and "acada" both have length 5.
    expect(minWindowSubsequence("abacada", "aaa")).toBe("abaca");
  });
});

describe("performance", () => {
  it("solves a 20000-character s with a 100-character t in under 100 ms", () => {
    // The only b is the last character, so the shortest window is it plus
    // the 99 a's right before it.
    const s = "a".repeat(19999) + "b";
    const t = "a".repeat(99) + "b";
    let result = "";
    const ms = elapsedMs(() => {
      result = minWindowSubsequence(s, t);
    });
    expect(result).toBe(t);
    expect(ms).toBeLessThan(100);
  });
  it("returns empty for a 20000-character s with no match in under 100 ms", () => {
    // s has no b at all, so no window can finish t.
    const s = "a".repeat(20000);
    const t = "a".repeat(99) + "b";
    let result: string | undefined;
    const ms = elapsedMs(() => {
      result = minWindowSubsequence(s, t);
    });
    expect(result).toBe("");
    expect(ms).toBeLessThan(100);
  });
});
