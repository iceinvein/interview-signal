import { describe, expect, it } from "vitest";
import { validateNewMember } from "../../src/domain/member.ts";
import { expectErr, expectOk } from "../fixtures.ts";

describe("validateNewMember", () => {
  it("lower-cases and trims the email", () => {
    const member = expectOk(validateNewMember({ name: "Ada", email: "  Ada@Example.COM " }));
    expect(member.email).toBe("ada@example.com");
  });

  it("rejects a blank name", () => {
    const error = expectErr(validateNewMember({ name: "   ", email: "ada@example.com" }), "validation");
    expect(error).toMatchObject({ field: "name" });
  });

  it("rejects an email without a domain", () => {
    const error = expectErr(validateNewMember({ name: "Ada", email: "ada@" }), "validation");
    expect(error).toMatchObject({ field: "email" });
  });
});
