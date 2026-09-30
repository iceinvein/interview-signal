import type { Sender } from './delivery.ts';

/**
 * Sends one delivery attempt with fetch. Redirects are not followed (a 3xx is
 * a failed attempt) and every attempt is bounded by `timeoutMs`, so a
 * destination that never answers still frees its slot.
 */
export function createHttpSender(timeoutMs: number): Sender {
  return async ({ url, webhookId, body, contentType }) => {
    const headers: Record<string, string> = { 'x-webhook-id': webhookId };
    if (contentType !== undefined) headers['content-type'] = contentType;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
      // We never look at the response body; discard it so the connection can be reused.
      await res.body?.cancel();
      return { ok: res.status >= 200 && res.status < 300, status: res.status };
    } catch (err) {
      return { ok: false, error: describeError(err) };
    }
  };
}

function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  if (err.name === 'TimeoutError') return 'timed out';
  // fetch wraps network failures as "fetch failed" with the useful part in `cause`.
  const cause = err.cause instanceof Error ? `: ${err.cause.message}` : '';
  return `${err.message}${cause}`;
}
