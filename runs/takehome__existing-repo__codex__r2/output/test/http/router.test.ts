import { describe, expect, it } from "vitest";
import { createRouter } from "../../src/http/router.ts";

describe("router", () => {
  const router = createRouter();
  router.add("GET", "/things/:thingId", (params) => ({ status: 200, body: params }));

  it("passes decoded path parameters to the handler", () => {
    expect(router.handle({ method: "GET", path: "/things/a%20b" })).toEqual({ status: 200, body: { thingId: "a b" } });
  });

  it("answers 405 when the path exists under another method", () => {
    expect(router.handle({ method: "DELETE", path: "/things/1" }).status).toBe(405);
  });

  it("answers 404 for an unknown path", () => {
    expect(router.handle({ method: "GET", path: "/nothing" }).status).toBe(404);
  });
});
