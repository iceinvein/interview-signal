import type { Sender } from "./dispatcher.ts";

/** Real HTTP sender. Redirects are not followed: a 3xx is a failed attempt. */
export function httpSender(timeoutMs: number): Sender {
  return async (destination, { id, body, contentType }) => {
    const headers: Record<string, string> = { "X-Webhook-Id": id };
    if (contentType !== undefined) headers["Content-Type"] = contentType;
    const res = await fetch(destination, {
      method: "POST",
      headers,
      body: body as Uint8Array<ArrayBuffer>, // Buffer.concat output is never SharedArrayBuffer-backed
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    await res.body?.cancel(); // release the connection; we only need the status
    return res.status;
  };
}
