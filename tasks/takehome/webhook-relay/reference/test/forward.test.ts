import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { forwardToDestination } from "../src/forward.ts";

type Received = { method?: string; headers: IncomingMessage["headers"]; body: Buffer };

let server: Server | undefined;

afterEach(async () => {
  await new Promise((resolve) => server?.close(resolve) ?? resolve(undefined));
  server = undefined;
});

async function destination(status: number): Promise<{ url: string; received: Received[] }> {
  const received: Received[] = [];
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    received.push({ method: req.method, headers: req.headers, body: Buffer.concat(chunks) });
    res.writeHead(status).end();
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/hook`, received };
}

const event = {
  id: "evt_42",
  tenantId: "acme",
  body: Buffer.from("a=1&b=2"),
  contentType: "application/x-www-form-urlencoded",
};

describe("forwardToDestination", () => {
  it("posts the original body and content type with the event id header", async () => {
    const dest = await destination(204);
    await forwardToDestination(dest.url, event, 1000);
    expect(dest.received).toHaveLength(1);
    expect(dest.received[0].method).toBe("POST");
    expect(dest.received[0].body.toString()).toBe("a=1&b=2");
    expect(dest.received[0].headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(dest.received[0].headers["x-webhook-id"]).toBe("evt_42");
  });

  it("reports a 2xx as delivered", async () => {
    const dest = await destination(204);
    expect(await forwardToDestination(dest.url, event, 1000)).toBe(true);
  });

  it("reports a non-2xx as a failed attempt", async () => {
    const dest = await destination(500);
    expect(await forwardToDestination(dest.url, event, 1000)).toBe(false);
  });

  it("reports a refused connection as a failed attempt", async () => {
    expect(await forwardToDestination("http://127.0.0.1:1/hook", event, 1000)).toBe(false);
  });
});
