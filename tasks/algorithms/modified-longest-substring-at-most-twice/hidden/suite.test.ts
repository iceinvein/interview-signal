let longestSubstringAtMostTwice: (typeof import("./solution.ts"))["longestSubstringAtMostTwice"];

beforeAll(async () => {
  ({ longestSubstringAtMostTwice } = await import("./solution.ts"));
});

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("basic", () => {
  it("returns the whole length when every character appears twice", () => {
    expect(longestSubstringAtMostTwice("aabbcc")).toBe(6);
  });
  it("stops before a character's third occurrence", () => {
    expect(longestSubstringAtMostTwice("abcabcabc")).toBe(6);
  });
  it("drops the first of three leading copies", () => {
    expect(longestSubstringAtMostTwice("aaab")).toBe(3);
  });
  it("finds a substring that starts after the first character", () => {
    expect(longestSubstringAtMostTwice("abacab")).toBe(5);
  });
  it("allows two copies that are not adjacent", () => {
    expect(longestSubstringAtMostTwice("abcdeabcde")).toBe(10);
  });
  it("finds the longest substring at the end", () => {
    expect(longestSubstringAtMostTwice("aabaab")).toBe(4);
  });
  it("allows a pair that plain uniqueness would reject", () => {
    expect(longestSubstringAtMostTwice("abba")).toBe(4);
  });
  it("counts each character separately", () => {
    expect(longestSubstringAtMostTwice("abcabcbb")).toBe(6);
  });
});

describe("edge-cases", () => {
  it("returns zero for an empty string", () => {
    expect(longestSubstringAtMostTwice("")).toBe(0);
  });
  it("returns one for a single character", () => {
    expect(longestSubstringAtMostTwice("a")).toBe(1);
  });
  it("allows exactly two copies of one character", () => {
    expect(longestSubstringAtMostTwice("aa")).toBe(2);
  });
  it("limits a run of one character to two", () => {
    expect(longestSubstringAtMostTwice("aaaaa")).toBe(2);
  });
  it("counts spaces as characters", () => {
    expect(longestSubstringAtMostTwice("   ")).toBe(2);
  });
  it("treats upper and lower case as different", () => {
    expect(longestSubstringAtMostTwice("aaaAAA")).toBe(4);
  });
  it("handles the lowest and highest printable codes", () => {
    expect(longestSubstringAtMostTwice(" ~ ~ ~")).toBe(4);
  });
});

describe("performance", () => {
  it("handles 100000 characters cycling through all printable ASCII in under 100 ms", () => {
    // Cycling codes 32..126: any 190 consecutive characters hold each code
    // exactly twice, and any 191 hold one code three times.
    const n = 100000;
    let s = "";
    for (let i = 0; i < n; i++) s += String.fromCharCode(32 + (i % 95));
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = longestSubstringAtMostTwice(s);
    });
    expect(result).toBe(190);
    expect(ms).toBeLessThan(100);
  });
  it("handles 100000 copies of one character in under 100 ms", () => {
    const s = "z".repeat(100000);
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = longestSubstringAtMostTwice(s);
    });
    expect(result).toBe(2);
    expect(ms).toBeLessThan(100);
  });
});
