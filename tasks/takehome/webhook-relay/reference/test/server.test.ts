import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { TenantConfig } from "../src/config.ts";
import type { RelayEvent } from "../src/delivery.ts";
import { createRelayServer } from "../src/server.ts";

const tenant = (requestsPerSecond: number): TenantConfig => ({
  destination: "http://dest.test/hook",
  maxAttempts: 3,
  initialBackoffMs: 100,
  requestsPerSecond,
});

let server: Server | undefined;

afterEach(async () => {
  await new Promise((resolve) => server?.close(resolve) ?? resolve(undefined));
  server = undefined;
});

async function start() {
  const dispatched: RelayEvent[] = [];
  const logLines: string[] = [];
  let nextId = 0;
  server = createRelayServer({
    tenants: new Map([
      ["acme", tenant(2)],
      ["globex", tenant(2)],
    ]),
    now: () => 0,
    newEventId: () => `evt_${++nextId}`,
    dispatch: (event) => dispatched.push(event),
    log: (line) => logLines.push(JSON.stringify(line)),
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const post = (path: string, body = '{"ok":true}', contentType = "application/json") =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      body,
      headers: { "content-type": contentType },
    });
  return { dispatched, logLines, post, port };
}

describe("relay server", () => {
  it("accepts a webhook with 202 and hands it on with its body and content type", async () => {
    const s = await start();
    const res = await s.post("/webhooks/acme", "a=1", "application/x-www-form-urlencoded");
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ id: "evt_1" });
    expect(s.dispatched).toHaveLength(1);
    expect(s.dispatched[0].tenantId).toBe("acme");
    expect(s.dispatched[0].body.toString()).toBe("a=1");
    expect(s.dispatched[0].contentType).toBe("application/x-www-form-urlencoded");
  });

  it("answers 404 for a tenant it does not know", async () => {
    const s = await start();
    const res = await s.post("/webhooks/initech");
    expect(res.status).toBe(404);
    expect(s.dispatched).toHaveLength(0);
  });

  it("answers 405 for a method other than POST", async () => {
    const s = await start();
    const res = await fetch(`http://127.0.0.1:${s.port}/webhooks/acme`);
    expect(res.status).toBe(405);
  });

  it("rejects webhooks over the tenant's limit with 429 and Retry-After, and does not forward them", async () => {
    const s = await start();
    await s.post("/webhooks/acme");
    await s.post("/webhooks/acme");
    const res = await s.post("/webhooks/acme");
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("1");
    expect(s.dispatched).toHaveLength(2);
  });

  it("keeps one tenant's limit from affecting another", async () => {
    const s = await start();
    await s.post("/webhooks/acme");
    await s.post("/webhooks/acme");
    await s.post("/webhooks/acme");
    const res = await s.post("/webhooks/globex");
    expect(res.status).toBe(202);
  });

  it("logs the request without its body, since bodies carry customer credentials", async () => {
    const s = await start();
    await s.post("/webhooks/acme", '{"api_key":"sk_live_secret"}');
    expect(s.logLines.length).toBeGreaterThan(0);
    expect(s.logLines.join("\n")).not.toContain("sk_live_secret");
    expect(JSON.parse(s.logLines[0])).toMatchObject({ msg: "webhook.accepted", tenant: "acme", eventId: "evt_1" });
  });
});
