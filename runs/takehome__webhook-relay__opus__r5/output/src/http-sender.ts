import type { Sender } from "./dispatcher.ts";

export function createHttpSender(timeoutMs: number): Sender {
  return async (destination, webhook) => {
    const headers: Record<string, string> = { "x-webhook-id": webhook.id };
    if (webhook.contentType !== undefined) headers["content-type"] = webhook.contentType;
    const res = await fetch(destination, {
      method: "POST",
      headers,
      body: webhook.body as Uint8Array<ArrayBuffer>,
      // A 3xx is a failed attempt, not something to follow with the payload attached.
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    }).catch((err: unknown) => {
      // fetch reports every network failure as "fetch failed"; surface the underlying reason.
      const cause = err instanceof Error ? (err.cause as { code?: string; message?: string } | undefined) : undefined;
      const detail = cause?.code ?? cause?.message;
      throw detail ? new Error(`${(err as Error).message}: ${detail}`) : err;
    });
    // Release the connection; we don't use the response body.
    await res.body?.cancel();
    return res.status;
  };
}
