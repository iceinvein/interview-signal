import { describe, expect, it } from "vitest";
import { errorCode, makeTestApp } from "../fixtures.ts";

describe("POST /members", () => {
  it("creates a member and returns the full record", () => {
    const { request } = makeTestApp();
    const response = request("POST", "/members", { name: "Ada", email: "ada@example.com" });
    expect(response).toEqual({
      status: 201,
      body: { id: "mem_1", name: "Ada", email: "ada@example.com", createdAt: "2026-03-02T09:00:00.000Z" },
    });
  });

  it("answers 400 naming the field when email is missing", () => {
    const { request } = makeTestApp();
    const response = request("POST", "/members", { name: "Ada" });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: "validation", field: "email" } });
  });

  it("answers 409 email_taken for a duplicate email", () => {
    const { request } = makeTestApp();
    request("POST", "/members", { name: "Ada", email: "ada@example.com" });
    const response = request("POST", "/members", { name: "Ada L", email: "ada@example.com" });
    expect(response.status).toBe(409);
    expect(errorCode(response)).toBe("email_taken");
  });
});

describe("GET /members/:memberId", () => {
  it("answers 404 for an unknown member", () => {
    const { request } = makeTestApp();
    expect(request("GET", "/members/mem_404").status).toBe(404);
  });
});
