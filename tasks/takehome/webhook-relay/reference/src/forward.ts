import type { RelayEvent } from "./delivery.ts";

/** One delivery attempt. True on a 2xx; false on any other status, a network error or a timeout. */
export async function forwardToDestination(destination: string, event: RelayEvent, timeoutMs: number): Promise<boolean> {
  const headers: Record<string, string> = { "x-webhook-id": event.id };
  if (event.contentType !== undefined) headers["content-type"] = event.contentType;
  try {
    const res = await fetch(destination, {
      method: "POST",
      headers,
      body: new Uint8Array(event.body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    await res.body?.cancel();
    return res.ok;
  } catch {
    // Refused, reset or timed out: all of these are a failed attempt the caller retries.
    return false;
  }
}
