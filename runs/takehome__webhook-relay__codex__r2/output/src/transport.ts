import type { Post, Webhook } from './delivery.js';

export const DELIVERY_TIMEOUT_MS = 10_000;

export const postWebhook: Post = async (destination: string, webhook: Webhook): Promise<number> => {
  const headers: Record<string, string> = { 'X-Webhook-Id': webhook.id };
  if (webhook.contentType !== undefined) headers['Content-Type'] = webhook.contentType;
  const response = await fetch(destination, {
    method: 'POST',
    headers,
    body: new Uint8Array(webhook.body),
    redirect: 'manual',
    signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
  });
  await response.body?.cancel();
  return response.status;
};
