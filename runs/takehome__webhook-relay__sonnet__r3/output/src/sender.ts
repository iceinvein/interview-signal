export interface OutboundWebhook {
  url: string;
  id: string;
  body: Buffer;
  contentType: string | undefined;
}

/** Performs one HTTP attempt. Resolves with the status; rejects on network error/timeout. */
export type Sender = (req: OutboundWebhook) => Promise<{ status: number }>;

export function httpSender(timeoutMs = 10_000): Sender {
  return async ({ url, id, body, contentType }) => {
    const headers: Record<string, string> = { "x-webhook-id": id };
    if (contentType !== undefined) headers["content-type"] = contentType;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: new Uint8Array(body.buffer as ArrayBuffer, body.byteOffset, body.length),
      redirect: "manual", // a redirect is not a 2xx; never follow tenant-supplied redirects
      signal: AbortSignal.timeout(timeoutMs),
    });
    await res.body?.cancel(); // release the connection; we don't need the response
    return { status: res.status };
  };
}
