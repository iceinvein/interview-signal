import type { Sender } from "./delivery.ts";

/**
 * Real HTTP delivery via the built-in fetch. The timeout matters for isolation:
 * without it a destination that accepts the connection and never answers
 * would hold a concurrency slot forever.
 */
export function httpSender({ timeoutMs }: { timeoutMs: number }): Sender {
  return async ({ url, webhookId, body, contentType }) => {
    const headers: Record<string, string> = { "x-webhook-id": webhookId };
    if (contentType !== undefined) headers["content-type"] = contentType;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        // Buffer is a valid fetch body at runtime; @types/node's Buffer<ArrayBufferLike> just doesn't satisfy BodyInit.
        body: body as Uint8Array<ArrayBuffer>,
        // A 3xx is "not 2xx", so it's a failed attempt; following it would also
        // let a destination bounce tenant secrets to a host nobody configured.
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
      // Release the connection; we don't care what the destination said.
      await res.body?.cancel().catch(() => {});
      return res.status >= 200 && res.status < 300 ? { ok: true, status: res.status } : { ok: false, status: res.status };
    } catch (err) {
      const e = err as Error & { cause?: { code?: string } };
      return { ok: false, error: e.cause?.code ?? e.name };
    }
  };
}
