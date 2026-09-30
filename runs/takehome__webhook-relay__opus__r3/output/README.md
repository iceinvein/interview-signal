# Webhook relay

Accepts webhooks at `POST /webhooks/:tenantId`, replies `202` straight away, and forwards each one to the tenant's destination, retrying with exponential backoff. Each tenant gets its own rate limit and delivery capacity, so one tenant can't hold up another.

## Running

Requires Node 24. It runs TypeScript directly through Node's built-in type stripping, so there is no build step.

```sh
npm install
PORT=8080 TENANTS_FILE=./tenants.example.json npm start
npm test            # node:test, ~0.5s, no real sleeps
npm run typecheck   # tsc --noEmit
```

The only dependencies are `typescript` and `@types/node`, both dev-only. HTTP uses `node:http`, forwarding uses the built-in `fetch`, and tests use `node:test`. At this size a framework would add more surface than it saves.

## Layout

| File | Responsibility |
| --- | --- |
| `src/config.ts` | Loads and validates the tenants file. It fails at startup and names the bad tenant and field. |
| `src/rateLimiter.ts` | Per-tenant sliding-window limiter |
| `src/delivery.ts` | `TenantDispatcher` (per-tenant queue, concurrency, retries) and `fetchSender` (one HTTP attempt) |
| `src/relay.ts` | Transport-independent core that decides accept / 404 / 429 / 503 and hands off to the dispatcher |
| `src/server.ts` | HTTP layer: routing, body reading, status codes, access log |
| `src/clock.ts` | `Clock` interface. All time-dependent code goes through it. |
| `src/index.ts` | Wiring, env vars, signal handling |

## Behaviour and the decisions behind it

### Logging request bodies: I did not do this as written

The brief asks for each incoming request to be logged "including its full body". It also says the bodies "routinely include their customers' API keys and access tokens". Writing those to logs would spread third-party credentials into log storage, log shippers and everyone with log access, usually with longer retention and wider access than the data should have. I don't think I should build that without checking first, so the relay logs one structured line per request with:

`tenantId`, `method`, `path`, `status`, `webhookId`, `contentType`, `bodyBytes`, `bodySha256`, `durationMs`

Every delivery attempt is also logged with its `webhookId`, attempt number, status or error, and the delay before the next retry. On-call can follow an event from arrival to delivery or abandonment. The SHA-256 lets them confirm that a payload a tenant or destination shows them is the one we received, without us storing it. A test checks that neither the body nor the destination URL (which may contain a token) appears in the logs.

**Question for you:** what does on-call actually need from the body? If it's the event type or a provider event id, I'd log those specific fields from an allowlist. If they really need full payloads, I'd put them in a separate store with short retention, encryption and access controls, not in the general logs.

### Accepting and rate limiting

- The order of checks is: route, then `404` for an unknown tenant (before reading the body), then read the body, then `503` if the tenant's backlog is full, then `429` if over the rate limit, then `202`.
- `202` returns `{"id": "<uuid>"}` and an `X-Webhook-Id` header, so a sender can correlate its request with our logs and the destination's.
- **Rate limit:** I used a sliding-window log, which allows at most `requestsPerSecond` acceptances in *any* rolling 1000 ms. A token bucket or fixed window can let through nearly twice the limit across a window boundary, and the brief says "at most". It costs O(limit) memory per tenant. Only accepted webhooks use a slot. `Retry-After` is the number of whole seconds (rounded up, minimum 1) until the oldest acceptance leaves the window.
- Tenant ids are looked up in a `Map`, so paths like `/webhooks/__proto__` get a `404`.
- **Body limit:** 1 MiB, answered with `413`. The brief doesn't give a limit, but an unbounded in-memory body is a DoS risk. *Question: what do the largest real payloads look like?*
- `405` for non-POST on the webhook route. `404` for any other path.

### Delivery

- **Headers:** the forwarded request carries only `Content-Type` (if the sender set one) and `X-Webhook-Id`. I don't pass other incoming headers through. They can include the provider's signature or our own ingress credentials, and the brief only asks for these two. *Question: do destinations need the provider's signature headers (e.g. `Stripe-Signature`) to verify authenticity?* If so, that should be an explicit per-tenant allowlist.
- **Success** is any `2xx`. Anything else is a failed attempt: other statuses, connection errors, and a 10 s timeout. Redirects are **not followed**. A `3xx` isn't a `2xx`, and following it would send tenant secrets to a host that isn't the configured destination.
- **Backoff:** after failed attempt *n*, the next attempt is due `initialBackoffMs × 2^(n-1)` later. With `maxAttempts: 4, initialBackoffMs: 1000`, attempts happen at t = 0, 1 s, 3 s, 7 s. I didn't add jitter because the brief specifies exact doubling. In production I'd add it so many events failing together don't retry in lockstep. I also ignore a destination's `Retry-After` for the same reason.
- A retry is due *no earlier* than its backoff. If the tenant's concurrency slots are all busy at that moment, it joins the back of the tenant's queue.
- An event that uses up `maxAttempts` is logged at `error` level as `delivery abandoned` and dropped. In production it would go to a dead-letter store for replay.
- **Ordering is not guaranteed.** Deliveries run concurrently, and a retry doesn't block later events. The brief implies at-least-once with dedup via `X-Webhook-Id`, not ordering. *Question: do any tenants rely on order?*
- Delivery is **at-least-once**. If a destination processes a request but the response is lost or times out, we retry it with the same id.

### Tenant isolation

Each tenant has its own `TenantDispatcher` with:

- at most **10 concurrent** requests to its destination, so a slow destination ties up its own slots and nothing else;
- at most **10,000 unfinished** webhooks (queued, in flight, or waiting to retry). Beyond that it returns `503` with `Retry-After: 1`. Without this cap, a destination that's down plus a busy sender would grow memory until the process died, which would take every tenant down with it.

An event waiting out its backoff holds no concurrency slot. Rate limiters are per tenant. Tests cover a hung destination for one tenant while another tenant's webhooks are delivered straight away, and one tenant hitting 429 while another is still accepted.

These limits are process-wide constants in `index.ts`. I'd make them per-tenant config if tenants vary a lot.

### Things this version doesn't do

- **Durability:** state is in memory, as the brief allows. A restart or crash loses queued and retrying webhooks, even though we already sent a `202`. On `SIGTERM` the server stops accepting and exits without draining. The fix is to write to a durable queue before replying `202`, and I'm happy to discuss that.
- **Single process:** rate limits and backlogs are per process. Running several replicas would multiply the effective limit.
- **SSRF:** destinations come from our own config file, so I trust them. If tenants could set their own URLs, we'd need to block private and link-local addresses.
- Node's `fetch` refuses some ports (for example 1, 9, 25), so a destination on one of those will always fail. That's worth rejecting in config validation.
- No metrics endpoint. Queue depth, attempt outcomes and delivery latency per tenant would be the first ones I'd add.

## Testing approach

Time-dependent logic never uses real timers in tests. `FakeClock` (`test/fakeClock.ts`) implements `Clock`, and `advance(ms)` fires due timers in order and lets the async work they start finish. That lets the tests check exact values:

- retry timestamps are exactly `[0, 1000, 3000, 7000]`, with no retry at 999 ms;
- the limiter still rejects at 999 ms and allows again at exactly 1000 ms, with an exact `retryAfterMs`;
- a burst straddling a second boundary can't exceed the limit.

`test/server.test.ts` runs the real HTTP server and the real `fetchSender` against local destination servers. It checks that binary bodies are forwarded unchanged, the `Content-Type` and id headers, `202` while the destination hangs, 404/405/413/429 handling, how each status and error is classified, no redirect following, timeouts, and that secrets don't appear in the logs.

## If I had more time

1. Write to a durable queue (e.g. SQS or a Postgres outbox) before replying `202`, plus a dead-letter store and replay tool.
2. Per-tenant metrics and alerting on abandoned deliveries.
3. Jitter on backoff, and per-tenant concurrency and backlog config.
4. Graceful shutdown that drains in-flight attempts.
