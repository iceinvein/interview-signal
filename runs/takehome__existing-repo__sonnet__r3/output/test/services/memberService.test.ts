import { beforeEach, describe, expect, it } from "vitest";
import { expectErr, expectOk, FIXED_NOW, makeWorld, type World } from "../fixtures.ts";

describe("MemberService.register", () => {
  let world: World;
  beforeEach(() => {
    world = makeWorld();
  });

  it("stores the member with a generated id and the current time", () => {
    const member = expectOk(world.services.members.register({ name: "Ada", email: "ada@example.com" }));
    expect(member).toEqual({ id: "mem_1", name: "Ada", email: "ada@example.com", createdAt: FIXED_NOW });
    expect(world.repos.members.findById("mem_1")).toEqual(member);
  });

  it("rejects an email that is already registered, ignoring case", () => {
    world.seedMember({ email: "ada@example.com" });
    const result = world.services.members.register({ name: "Ada", email: "ADA@example.com" });
    expectErr(result, "conflict", "email_taken");
  });
});

describe("MemberService.get", () => {
  it("returns not_found for an unknown id", () => {
    const world = makeWorld();
    const error = expectErr(world.services.members.get("mem_missing"), "not_found");
    expect(error).toMatchObject({ entity: "member", id: "mem_missing" });
  });
});
