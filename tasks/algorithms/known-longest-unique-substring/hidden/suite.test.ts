let lengthOfLongestSubstring: (typeof import("./solution.ts"))["lengthOfLongestSubstring"];

beforeAll(async () => {
  ({ lengthOfLongestSubstring } = await import("./solution.ts"));
});

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe("basic", () => {
  it("finds a repeating block of three", () => {
    expect(lengthOfLongestSubstring("abcabcbb")).toBe(3);
  });
  it("finds a run of one repeated character", () => {
    expect(lengthOfLongestSubstring("bbbbb")).toBe(1);
  });
  it("finds a substring that starts after a repeat", () => {
    expect(lengthOfLongestSubstring("pwwkew")).toBe(3);
  });
  it("returns the whole length when every character differs", () => {
    expect(lengthOfLongestSubstring("abcdef")).toBe(6);
  });
  it("keeps the window start from moving backwards", () => {
    expect(lengthOfLongestSubstring("abba")).toBe(2);
  });
  it("restarts just after the earlier copy of a repeat", () => {
    expect(lengthOfLongestSubstring("dvdf")).toBe(3);
  });
  it("finds the longest substring at the end", () => {
    expect(lengthOfLongestSubstring("tmmzuxt")).toBe(5);
  });
});

describe("edge-cases", () => {
  it("returns zero for an empty string", () => {
    expect(lengthOfLongestSubstring("")).toBe(0);
  });
  it("returns one for a single character", () => {
    expect(lengthOfLongestSubstring("a")).toBe(1);
  });
  it("counts a space as a character", () => {
    expect(lengthOfLongestSubstring("a b")).toBe(3);
  });
  it("treats repeated spaces as a repeat", () => {
    expect(lengthOfLongestSubstring("  ")).toBe(1);
  });
  it("treats upper and lower case as different", () => {
    expect(lengthOfLongestSubstring("aAbB")).toBe(4);
  });
  it("handles punctuation", () => {
    expect(lengthOfLongestSubstring("!@#!")).toBe(3);
  });
  it("handles a repeat at the very end", () => {
    expect(lengthOfLongestSubstring("abcdd")).toBe(4);
  });
  it("handles the lowest and highest printable codes", () => {
    expect(lengthOfLongestSubstring(" ~ ~")).toBe(2);
  });
});

describe("performance", () => {
  it("handles 100000 characters cycling through all printable ASCII in under 100 ms", () => {
    // Cycling codes 32..126: any 95 consecutive characters are distinct and
    // any 96 contain a repeat.
    const n = 100000;
    let s = "";
    for (let i = 0; i < n; i++) s += String.fromCharCode(32 + (i % 95));
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = lengthOfLongestSubstring(s);
    });
    expect(result).toBe(95);
    expect(ms).toBeLessThan(100);
  });
  it("handles 100000 copies of one character in under 100 ms", () => {
    const s = "z".repeat(100000);
    let result: number | undefined;
    const ms = elapsedMs(() => {
      result = lengthOfLongestSubstring(s);
    });
    expect(result).toBe(1);
    expect(ms).toBeLessThan(100);
  });
});
