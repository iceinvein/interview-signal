let countDigitSum: (typeof import("./solution.ts"))["countDigitSum"];

beforeAll(async () => {
  ({ countDigitSum } = await import("./solution.ts"));
});

function elapsedMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

const EIGHTEEN_NINES = "9".repeat(18);
const TEN_TO_18 = `1${"0".repeat(18)}`;

describe("basic", () => {
  it("matches the worked example", () => {
    expect(countDigitSum("20", 2)).toBe(3n);
  });
  it("counts a single digit", () => {
    expect(countDigitSum("9", 5)).toBe(1n);
  });
  it("counts two-digit numbers summing to 9", () => {
    // 9, 18, 27, 36, 45, 54, 63, 72, 81, 90.
    expect(countDigitSum("99", 9)).toBe(10n);
  });
  it("counts up to a limit that cuts the hundreds", () => {
    // 6, 15, 24, 33, 42, 51, 60, then 105, 114, 123.
    expect(countDigitSum("123", 6)).toBe(10n);
  });
  it("respects a tight leading digit", () => {
    // Six below 100, then 1xx: 5, 2xx: 4, 3xx: 3, 4xx: 2, and 500 itself.
    expect(countDigitSum("500", 5)).toBe(21n);
  });
  it("counts powers of ten for digit sum 1", () => {
    expect(countDigitSum("100", 1)).toBe(3n);
  });
});

describe("edge-cases", () => {
  it("counts zero for a limit of zero and target zero", () => {
    expect(countDigitSum("0", 0)).toBe(1n);
  });
  it("finds nothing below a limit of zero for a positive target", () => {
    expect(countDigitSum("0", 1)).toBe(0n);
  });
  it("counts only zero for target zero at the largest limit", () => {
    expect(countDigitSum(TEN_TO_18, 0)).toBe(1n);
  });
  it("includes the limit itself", () => {
    expect(countDigitSum("999", 27)).toBe(1n);
  });
  it("excludes numbers just above the limit", () => {
    expect(countDigitSum("998", 27)).toBe(0n);
  });
  it("returns zero when the target exceeds any reachable digit sum", () => {
    expect(countDigitSum("99", 19)).toBe(0n);
  });
  it("returns zero for the maximum target", () => {
    expect(countDigitSum(TEN_TO_18, 200)).toBe(0n);
  });
  it("counts the one number with the largest digit sum below 10^18", () => {
    expect(countDigitSum(TEN_TO_18, 162)).toBe(1n);
  });
  it("finds nothing one above the largest digit sum", () => {
    expect(countDigitSum(TEN_TO_18, 163)).toBe(0n);
  });
  it("counts every power of ten up to 10^18 for digit sum 1", () => {
    expect(countDigitSum(TEN_TO_18, 1)).toBe(19n);
  });
  it("counts 18-digit strings summing to 9 exactly", () => {
    // Stars and bars with no digit able to exceed 9: C(26, 17).
    expect(countDigitSum(EIGHTEEN_NINES, 9)).toBe(3124550n);
  });
  it("returns a count beyond the safe integer range exactly", () => {
    // Inclusion-exclusion: sum_k (-1)^k C(18,k) C(81 - 10k + 17, 17).
    expect(countDigitSum(EIGHTEEN_NINES, 81)).toBe(32458256583753952n);
  });
  it("counts target 100 below 10^18", () => {
    // Inclusion-exclusion: sum_k (-1)^k C(18,k) C(100 - 10k + 17, 17).
    expect(countDigitSum(TEN_TO_18, 100)).toBe(9869362547411187n);
  });
  it("respects a tight leading digit in an 18-digit limit", () => {
    // Leading digit 0 to 4 leaves 17 free digits summing to 5 - d, plus 5 * 10^17 itself.
    expect(countDigitSum(`5${"0".repeat(17)}`, 5)).toBe(26334n);
  });
  it("counts a large target under an 18-digit limit with a tight leading digit", () => {
    // Leading digit d from 0 to 4 leaves 17 free digits summing to 40 - d.
    expect(countDigitSum(`5${"0".repeat(17)}`, 40)).toBe(77510412194599n);
  });
});

describe("performance", () => {
  it("answers all 201 targets for 10^18 in under 1000 ms", () => {
    // Every x in [0, 10^18] has exactly one digit sum, so the counts total 10^18 + 1.
    let total = 0n;
    const ms = elapsedMs(() => {
      for (let target = 0; target <= 200; target++) total += countDigitSum(TEN_TO_18, target);
    });
    expect(total).toBe(1000000000000000001n);
    expect(ms).toBeLessThan(1000);
  });
  it("answers all 201 targets for a ragged 18-digit limit in under 1000 ms", () => {
    // Every x in [0, 987654321987654321] has exactly one digit sum.
    let total = 0n;
    const ms = elapsedMs(() => {
      for (let target = 0; target <= 200; target++) total += countDigitSum("987654321987654321", target);
    });
    expect(total).toBe(987654321987654322n);
    expect(ms).toBeLessThan(1000);
  });
});
