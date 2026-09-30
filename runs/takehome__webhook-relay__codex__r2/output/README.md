# Webhook relay

Requires Node 24. Install and run with:

```sh
npm install
PORT=3000 TENANTS_FILE=./tenants.example.json npm start
```

Replace the example destination with a reachable endpoint before sending events. Test with `npm test`. Tenant configuration is read once at startup; invalid URLs or retry/rate settings stop startup. `destination` must be an HTTP(S) URL, `maxAttempts` and `requestsPerSecond` must be positive integers, and `initialBackoffMs` must be a nonnegative integer.

Send `POST /webhooks/:tenantId` with any `Content-Type` and body bytes. An accepted request gets `202` after being placed in memory, without waiting for delivery. Unknown tenants get `404`. Each tenant has a rolling one-second rate limit; excess requests get `429` and a whole-second `Retry-After` value. Other methods on a known webhook route get `405`.

Each tenant has its own serial delivery worker and queue. A slow destination therefore does not hold another tenant's worker or HTTP response. The relay forwards the exact body bytes and incoming `Content-Type`, if present, with a UUID in `X-Webhook-Id`. The UUID is fixed across retries. Any destination `2xx` succeeds; redirects and all other statuses fail. Connection errors and a 10-second destination timeout also fail. Failed attempts wait `initialBackoffMs`, then twice the previous wait for each later retry, up to `maxAttempts` total attempts. After exhaustion the event is logged and discarded.

Every fully received incoming request produces a JSON line on stdout with its full body in `bodyBase64`, including rejected requests. If a client disconnects mid-body, the received prefix is logged with `incomplete: true`. Base64 preserves arbitrary bytes; **it does not protect secrets**. These logs contain tenant customer credentials and need restricted access and short retention. I followed the explicit full-body logging requirement for this exercise; in production I would ask whether a tightly controlled, short-lived diagnostic capture can replace routine full-body logs. Delivery logs carry event metadata, not payloads.

The service deliberately keeps state in memory. A `202` does not survive a process crash or restart, and an ambiguous timeout can cause duplicate delivery. Destinations should deduplicate by `X-Webhook-Id`. Queues and request bodies are not size bounded here; I would add per-tenant memory budgets and an explicit payload size policy before exposing this beyond a trusted ingress. The next production step would be a durable queue with bounded admission, metrics for queue depth and exhausted events, and a defined shutdown/drain policy. These are not included because this exercise permits in-memory state and does not specify overload behavior.
