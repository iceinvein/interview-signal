import { Agent, request } from "node:http";
// Protect each destination host from a thundering herd.
const agent = new Agent({ keepAlive: true, maxSockets: 4 });
import type { RelayEvent } from "./delivery.ts";
export async function forwardToDestination(destination: string, event: RelayEvent, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const headers: Record<string, string> = { "x-webhook-id": event.id, "content-length": String(event.body.length) };
    if (event.contentType !== undefined) headers["content-type"] = event.contentType;
    const req = request(destination, { method: "POST", headers, timeout: timeoutMs, agent }, (res) => {
      res.resume();
      resolve((res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.write(event.body);
    req.end();
  });
}
