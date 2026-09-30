/** Performs one delivery attempt. Resolves with the HTTP status; rejects on network failure/timeout. */
export type Sender = (req: {
  url: string;
  body: Buffer;
  contentType: string | undefined;
  webhookId: string;
}) => Promise<{ status: number }>;

export function httpSender(timeoutMs: number): Sender {
  return async ({ url, body, contentType, webhookId }) => {
    const headers: Record<string, string> = { "X-Webhook-Id": webhookId };
    if (contentType !== undefined) headers["Content-Type"] = contentType;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: body as Uint8Array<ArrayBuffer>, // Buffers from Buffer.concat are ArrayBuffer-backed
      // A redirect is not a 2xx, so it is a failed attempt. Following it would also
      // let a destination bounce our (secret-bearing) payload to a third party.
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    await res.body?.cancel(); // free the socket; we only need the status
    return { status: res.status };
  };
}
