# Webhook relay

Node 24 and TypeScript. No runtime dependencies.

## Run

```sh
npm install
PORT=3000 TENANTS_FILE=./tenants.example.json npm start
```

Replace the example tenant destination before sending traffic. Test with `npm test`.

Configuration is read once at startup. Each entry in `tenants` needs an HTTP(S) `destination`, a positive integer `maxAttempts`, a nonnegative integer `initialBackoffMs`, and a positive integer `requestsPerSecond`. Invalid configuration stops startup.

## Behavior and decisions

- `POST /webhooks/:tenantId` reads the body as bytes, then returns `202` after placing a known tenant's event in its in-memory queue. The response includes `X-Webhook-Id`. Unknown tenants return `404`. A rejected rate-limited event returns `429` with `Retry-After` in whole seconds.
- Each tenant has its own serial delivery queue and rolling one-second rate limiter. Serial delivery preserves acceptance order within a tenant. A slow tenant can hold up its own later events, but its delivery work never blocks another tenant's queue or incoming requests.
- A delivery attempt is a `POST` with the original bytes and `Content-Type` (if present) plus a stable `X-Webhook-Id`. A `2xx` ends delivery. All other statuses and connection errors cause a retry until `maxAttempts` is reached. The delays before retries are `initialBackoffMs`, twice that, and so on. Each attempt has a 10-second timeout so a hung destination cannot hold its tenant queue indefinitely.
- The rate limit counts accepted webhooks in the preceding rolling 1000 ms, measured with a monotonic clock. Requests are checked after their full body arrives. `Retry-After` rounds up to seconds because that header's standard value is an integer number of seconds.
- Incoming requests are logged as one JSON line with the full body in `bodyBase64`, including `404` and `429` requests. Base64 preserves arbitrary bytes; it **does not conceal secrets**. The brief explicitly asks for full-body logs even though payloads contain credentials. In deployment, these logs need access controls, short retention, and a clear decision about whether full payload logging is acceptable. Delivery logs contain IDs, attempts, statuses, and errors, without a second copy of the payload.

## Limits and follow-up questions

This exercise permits in-memory state, so a crash or restart loses accepted events, rate-limit history, and pending retries. Queues and request bodies are unbounded; a production version needs explicit payload and queue limits, backpressure, and a durable queue before acknowledging acceptance. I would ask what loss guarantee and maximum webhook size the product needs before choosing those limits. The fixed 10-second attempt timeout is another product choice to confirm against tenants' endpoint behavior.
