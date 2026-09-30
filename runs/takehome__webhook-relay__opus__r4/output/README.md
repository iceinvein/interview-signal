# Webhook relay

Accepts webhooks at `POST /webhooks/:tenantId`, replies `202` right away, and forwards each one to the tenant's configured destination. Failed deliveries are retried with exponential backoff. Rate limits and delivery queues are per tenant.

## Running

Requires Node 24. No runtime dependencies. Node 24 runs TypeScript directly (type stripping), so there is no build step. `typescript` and `@types/node` are dev dependencies, used only for `npm run typecheck`.

```sh
npm install
PORT=8080 TENANTS_FILE=./tenants.example.json npm start
npm test            # node:test, ~0.3s
npm run typecheck   # tsc --noEmit
```

```sh
curl -i -X POST -H 'content-type: application/json' -d '{"hello":1}' localhost:8080/webhooks/acme
# HTTP/1.1 202 Accepted
# {"id":"3b1f..."}
```

The service validates the tenants file at startup and exits non-zero if the file is invalid. It doesn't wait for the first webhook to find a problem.

## Layout

| File | Responsibility |
|---|---|
| `src/main.ts` | Reads env and config, wires real dependencies, handles signals |
| `src/server.ts` | HTTP routing, status codes, body reading, request logging |
| `src/rateLimiter.ts` | Sliding-window limiter (one per tenant) |
| `src/delivery.ts` | `TenantQueue`: per-tenant concurrency, backlog bound, retries/backoff |
| `src/httpSender.ts` | One delivery attempt over HTTP (`fetch`) → `ok` / failed |
| `src/config.ts` | Parse and validate the tenants file |
| `src/clock.ts` | `now()` / `setTimeout` abstraction: the only source of time |

Time is injected everywhere it matters (rate limiting, backoff) through `Clock`. So is the network (`Sender`). The tests use a `FakeClock`, and timing assertions are exact rather than "roughly after a sleep". For example, the backoff test checks that attempts happen at exactly `t = 0, 1000, 3000, 7000` and that nothing happens at `t = 999`. `test/server.test.ts` drives the real HTTP server with a fake clock and sender. `test/httpSender.test.ts` exercises the real `fetch` path against local servers, covering 2xx/3xx/4xx/5xx, connection refused and timeout.

## Decisions

### Logging request bodies: I did not do this, and it needs a conversation

Requirement 7 asks for every request to be logged with its full body. The brief also says those bodies routinely contain tenants' customers' API keys and access tokens. Logging them would copy live third-party credentials into our log pipeline: every log shipper, retention store and person with log access. That exposure is hard to undo once it has happened. I don't think I should make that trade-off unilaterally, so I built the safe version and am raising the question here.

What each request log line contains instead: method, path (without the query string, which is another common place for tokens), tenant, status, webhook id, content type, body size, **SHA-256 of the body**, and duration. For debugging, this answers "did we receive it?", "when?", "what did we answer?" and "what id did it get?". The hash lets on-call confirm whether the bytes a tenant says they sent match what we received, without us holding the bytes. Delivery attempts log the webhook id, attempt number, status or error, and the destination **origin only**. Destination URLs are often secrets themselves (think Slack incoming-webhook URLs).

If on-call really needs the payloads, I'd suggest these options, roughly in order of preference:
1. A short-retention, access-controlled store of payloads keyed by webhook id, separate from general logs. This is what a durable queue would give us anyway.
2. Per-tenant, time-boxed opt-in body capture for an active incident.
3. Redaction of known secret fields before logging. This is the weakest option, because payloads are opaque and arbitrary.

Question for you: what debugging problem does on-call hit today that made full bodies seem necessary? That would tell us which of these fits.

### Rate limiting
- **Sliding-window log** rather than a token bucket or fixed window. The spec says "at most N per second". A fixed window allows 2N across a boundary, and a token bucket's burst semantics are a different contract. The sliding-window log guarantees that no 1-second interval contains more than N acceptances, and a test checks this directly. It costs O(N) memory per tenant, in a ring buffer, which is fine for per-second limits.
- Only accepted requests consume capacity. Rejected ones don't, so a tenant hammering us recovers as soon as the window slides.
- The check happens **before the body is read**, so over-limit traffic is cheap to reject. As a result, a request that later fails with `413` has still used a slot. This can only make the limiter stricter, never looser.
- `Retry-After` is in whole seconds, rounded up: the time until the oldest slot in the window frees.

### Delivery and isolation
- Each tenant has its own `TenantQueue` with a **concurrency limit** (4 in flight) and a **backlog bound** (1000 accepted-but-unfinished events, including those waiting to retry). A dead or slow destination can use up only its own slots and its own backlog. Other tenants never queue behind it. Tests cover a hung destination and a full backlog.
- Every attempt has a **10 s timeout**. Without it, a destination that accepts the connection and never replies would hold a slot forever.
- An event waiting for its backoff **does not hold a concurrency slot**. When the wait ends, it rejoins the tenant's ready queue. If the tenant is saturated at that moment, the retry can happen somewhat *later* than `initialBackoffMs × 2^(n-1)`, but never earlier. I read the backoff as a minimum.
- When the backlog is full, the relay replies **`503` with `Retry-After: 1`**. The brief doesn't cover this case. An unbounded in-memory queue lets one tenant's outage exhaust memory for everyone, which breaks isolation. `503` tells the sender "not accepted, try again", which is honest. `429` would suggest they're sending too fast, which isn't the problem.
- **Ordering is not guaranteed.** With concurrency above 1 and retries, events can arrive out of order. Destinations already have `X-Webhook-Id` for dedup. If ordering matters to some tenants, concurrency 1 per tenant is a config change, but a failing event then blocks the tenant's whole stream for its retries. Question: does anyone need ordering?
- **Redirects are not followed.** A 3xx is "not 2xx", so it counts as a failed attempt. Following redirects would also let a destination send tenants' secrets on to a host nobody configured.
- After the final attempt fails, the event is logged at `error` (`delivery abandoned`) and dropped. With durable storage this would become a dead-letter queue with replay.

### Forwarded request
- `POST` with the original body bytes, the original `Content-Type` (omitted if the sender didn't send one) and `X-Webhook-Id`. No other incoming headers are forwarded. In particular, this rules out any upstream `Authorization` header or provider signature. Question: do destinations need the original provider's signature headers (e.g. `Stripe-Signature`) to verify authenticity? If so, we'd forward an allow-list. Separately, we should probably sign our own requests (HMAC with a per-tenant secret), so destinations can tell that a request came from us.
- The webhook id is a random UUID, also returned in the `202` body, so a sender can correlate its request with our logs.

### HTTP surface
- `404` for unknown tenants and for any other path. `405` for non-POST requests to the webhook route.
- Tenant lookups use a `Map`, so ids like `__proto__` or `constructor` can't resolve to object prototype properties.
- Bodies are limited to **1 MiB** (`413`), because the whole body is held in memory until delivery. Question: what's the largest payload we actually see?

### Configuration
- `requestsPerSecond` must be an integer ≥ 1. `maxAttempts` must be an integer ≥ 1 (1 means no retries). `initialBackoffMs` must be an integer ≥ 0. `destination` must be an absolute http(s) URL. The service fails at startup on any violation.
- Concurrency, backlog bound, attempt timeout and body limit are constants in `main.ts`. They are obvious candidates to become per-tenant settings, but I didn't want to invent config the brief didn't ask for.

## Known gaps / what I'd do next

- **Durability.** Everything is in memory: a restart or crash loses queued events and pending retries, even though they were already acknowledged with `202`. The fix is to persist before replying `202` (a Postgres table with `SKIP LOCKED`, SQS, or similar). That also gives us the dead-letter queue, replay, and a safe place for payloads (see logging above).
- **Graceful shutdown** currently stops accepting new webhooks and exits. It doesn't drain in-flight deliveries. Once events are durable, that stops mattering.
- **Single instance.** The rate limit and queues are per process. Running several replicas would multiply the effective limit unless the limiter moves to shared state (e.g. Redis).
- **SSRF.** Destinations come from our own config, so I trust them. If tenants can ever set their own destination, we need to block private and link-local address ranges at connection time.
- **Jitter** on backoff, so retries to a destination that just recovered don't arrive together. The spec prescribes exact doubling, so I left it out.
- **Metrics**: queue depth, attempts, abandonments and latency per tenant.
