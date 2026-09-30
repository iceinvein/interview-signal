import { describe, expect, it } from "vitest";
import { all, andThen, err, map, ok } from "../src/result.ts";

describe("Result helpers", () => {
  it("map transforms a success and leaves a failure untouched", () => {
    expect(map(ok(2), (n) => n * 3)).toEqual(ok(6));
    expect(map(err("nope"), (n: number) => n * 3)).toEqual(err("nope"));
  });

  it("andThen stops at the first failure", () => {
    const halve = (n: number) => (n % 2 === 0 ? ok(n / 2) : err(`odd: ${n}`));
    expect(andThen(ok(8), halve)).toEqual(ok(4));
    expect(andThen(andThen(ok(6), halve), halve)).toEqual(err("odd: 3"));
  });

  it("all returns the first failure in input order", () => {
    expect(all([ok(1), ok(2)])).toEqual(ok([1, 2]));
    expect(all([ok(1), err("a"), err("b")])).toEqual(err("a"));
  });
});
