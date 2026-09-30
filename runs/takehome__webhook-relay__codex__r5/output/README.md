# Webhook relay

Requires Node 24. Install and run with:

```sh
npm install
PORT=3000 TENANTS_FILE=./tenants.json npm start
```

`TENANTS_FILE` must contain a `tenants` object, as shown in [tenants.example.json](tenants.example.json). The service validates its settings at startup. To run the tests, use `npm test`.

Send a webhook to `POST /webhooks/:tenantId`. A known tenant receives `202` and an `X-Webhook-Id` response header. An unknown tenant receives `404`. A tenant above its rate limit receives `429` with `Retry-After` in whole seconds. The relay forwards only the body bytes, `Content-Type` when supplied, and `X-Webhook-Id`; it does not copy other inbound headers.

## Decisions

- **Rate limit:** A rolling 1,000 ms window per tenant. At most `requestsPerSecond` accepted timestamps can be present in that window. Rejected requests do not consume capacity. `Retry-After` rounds up to a whole second.
- **Delivery:** Each tenant has its own FIFO queue and one asynchronous delivery worker. A slow tenant can hold up later events for that same tenant, but other tenants' workers and HTTP acceptance continue. Any `2xx` succeeds; redirects are not followed. Failed attempts, including HTTP errors and timeouts, use `initialBackoffMs`, then twice the preceding delay. `maxAttempts` includes the first request. Each attempt has a 10 second timeout.
- **Logging:** Every incoming request produces a JSON line containing its complete body in `bodyBase64`, plus method, path, content type, status, and event ID when accepted. Base64 preserves arbitrary binary bytes. These logs contain customer secrets by design because the brief explicitly requires full bodies. In a real deployment, I would ask whether a protected, short lived diagnostic store could replace routine full body logging. Until then, log access and retention need to be tightly restricted.
- **Configuration:** Read once at startup. A change requires a restart. Retry settings that would exceed Node's timer range are rejected at startup.

## Limits and follow-up

Accepted events and rate limit state are in memory. A restart loses queued or in-flight events, and the source may have already received `202`. The queues and request bodies have no size limit in this exercise, so a prolonged outage or very large payload can exhaust memory and eventually affect other tenants. For production, I would add a durable queue, per-tenant queue and byte quotas, an inbound body limit, overload responses, and metrics/alerts for queue age and exhausted deliveries. I would also clarify whether headers such as `Content-Encoding` and signature headers need forwarding, and whether tenants require multiple concurrent deliveries with ordering guarantees.
