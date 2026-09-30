# Webhook relay

Accepts webhooks at `POST /webhooks/:tenantId`, replies `202` straight away, and forwards each one to the tenant's destination with retries. Each tenant gets its own rate limit and its own delivery capacity.

## Running

Requires Node 24. There are no runtime dependencies. Node 24 runs the TypeScript directly (type stripping), so there is no build step.

```sh
npm install
PORT=8080 TENANTS_FILE=./tenants.example.json npm start
npm test            # node:test, about 45 tests, runs in well under a second
npm run typecheck   # tsc --noEmit
```

The only dev dependencies are `typescript` and `@types/node`. HTTP serving uses `node:http`, outbound requests use the built-in `fetch`, and tests use `node:test`. For a service this small I didn't think a framework or a test runner earned a place in the dependency list.

If the tenants file is invalid (bad JSON, a non-http(s) destination, `maxAttempts < 1`, non-integer values, and so on), the service logs the reason and exits non-zero. It doesn't start with a partial config.

## Layout

| File | Responsibility |
| --- | --- |
| `src/main.ts` | Reads env and config, wires everything together, handles shutdown. Operational limits live here. |
| `src/config.ts` | Parses and validates the tenants file. |
| `src/server.ts` | HTTP layer: routing, status codes, body reading, request logging. |
| `src/rateLimiter.ts` | Per-tenant sliding-window limiter. |
| `src/delivery.ts` | `TenantDelivery`: one tenant's queue, concurrency, retry/backoff, and backlog cap. |
| `src/httpSender.ts` | One outbound attempt via `fetch`: timeout, no redirects, mapping the result to success or failure. |
| `src/clock.ts` | The only source of time. |

Time is injected. The rate limiter and the retry scheduler read the time and set timers only through a `Clock`. Tests use a `FakeClock` that moves only when `advance()` is called, and delivery goes through an injected `Sender`. As a result, the time-dependent tests assert exact timings (e.g. attempts at `[0, 1000, 3000, 7000]` ms, and nothing at 999 ms). They never sleep, so they can't be flaky. `httpSender` is tested separately against real local HTTP servers, and `server.test.ts` sends real HTTP requests to the relay.

## Behaviour and the decisions behind it

### Logging request bodies: I didn't do this

Requirement 7 asks for each request to be logged with its full body. The brief also says bodies routinely contain tenants' customers' API keys and access tokens. Writing those to logs would copy live third-party credentials into every log pipeline, retention store and on-call laptop that sees them, and they would outlive the relay's in-memory state by a long way. I decided not to do that without talking to you first, so this is the question I would have asked before starting.

What is logged instead, as one JSON line per request (including 404s and 429s): method, path, tenant, status, duration, webhook id, content type, body size, and the **SHA-256 of the body**. The hash lets on-call confirm that "the body the tenant says they sent" matches what we received and forwarded, without the log holding the content. Delivery attempts are logged separately (attempt number, destination status or error, next retry delay), and those lines carry the webhook id so they can be joined to the request line. Destination response bodies are never read or logged. A test checks that a secret in a request body never appears in any log line.

If on-call really needs payloads, I'd suggest one of these (in order of preference):
- Short-lived, access-controlled payload capture, turned on per tenant for a debugging session, stored separately from general logs.
- Field-level redaction for known content types. This is fragile, because bodies are opaque and secrets can be anywhere.

### Rate limiting

- **Algorithm:** a sliding-window log. It accepts at most `requestsPerSecond` in *any* 1-second span. A fixed window would let 2× through across a second boundary. A token bucket is the other reasonable option, but "at most N per second" reads to me as a hard cap, and with a sliding window it holds exactly. Memory is O(N) per tenant. For very high limits I'd switch to a token bucket or an approximate sliding window.
- **Order of checks:** unknown tenant → `404`, then the rate limit, then the body is read. Rejected requests don't consume slots. A request that is rate-limited costs almost nothing, since its body is drained without being buffered.
- **`Retry-After`** is the time until the oldest slot leaves the window, rounded **up** to whole seconds (minimum 1). HTTP-date and fractional values are worse for clients.
- Requests over the limit are not forwarded, and they aren't queued either.

### Delivery and retries

- Webhook ids are random UUIDs generated at acceptance. They're returned in the `202` body (`{"id": ...}`), logged, and sent as `X-Webhook-Id` on every attempt.
- The forwarded request is a `POST` with the original body bytes and `Content-Type` (omitted if the original had none) plus `X-Webhook-Id`. **No other inbound headers are forwarded.** This is a choice. Inbound headers may include things meant for us (auth, cookies, hop-by-hop headers), and a signature header from the original sender wouldn't mean much to the destination after a relay anyway. *Question:* do tenants rely on original headers such as provider signatures (`Stripe-Signature` etc.)? If so, I'd forward an explicit allow-list per tenant.
- `2xx` counts as delivered. Everything else is a failed attempt: other statuses, connection errors, and **a timeout of 10 s per attempt**. Without a timeout, a destination that accepts the connection and never replies would hold a delivery slot forever.
- **Redirects are not followed**, so a `3xx` is a failure. Following redirects for a POST is ambiguous (303 turns it into a GET), and it would let a destination bounce us to an arbitrary host.
- Backoff is exactly as specified: wait `initialBackoffMs` before retry 1, doubling each time. `maxAttempts` includes the first try. There is **no jitter**, because the brief specifies the waits exactly. In production I'd want to add jitter so that a destination recovering from an outage doesn't get every retry at the same instant. I'd also cap the delay: with `maxAttempts: 20` the last wait would be around 6 days.
- When attempts run out, the webhook is dropped and logged at `error` level ("webhook delivery abandoned"). With durable storage this would go to a dead-letter store.
- The `Retry-After` header on destination `429`/`503` responses is ignored. The brief's schedule wins. Honouring it would be a sensible change.

### Tenant isolation

Each tenant has its own `TenantDelivery` with:
- **its own concurrency limit** (10 in-flight attempts), so a slow destination can only tie up its own tenant's slots;
- **its own backlog cap** (10,000 webhooks: queued, in flight, or waiting to retry), so a destination that's down can't grow memory without bound and take the process down for everyone. When a tenant's backlog is full, new webhooks for *that tenant* get `503` with `Retry-After`, which pushes the backpressure back to the sender. That seemed better than accepting with a `202` and then losing the webhook.
- A webhook waiting for its next retry **doesn't hold a concurrency slot**, so one tenant's failing event doesn't block that tenant's newer events.

Tests cover the key isolation property directly: a tenant whose destination never responds has 50 webhooks queued, and another tenant's webhook is still delivered at t=0.

Two limits of this design. All tenants share one Node process, so CPU-heavy work (there isn't any today) would affect everyone. Tenants that share a destination host also share undici's per-origin connection pool.

### Other HTTP details

- The body limit is **1 MiB**, and larger bodies get `413`. The brief doesn't give a limit, but everything is held in memory, so some limit is needed. *Question:* what's the largest webhook tenants actually receive?
- Tenant lookup uses a `Map`, so ids like `__proto__` are simply unknown tenants. Tenant ids in the path are URL-decoded.
- A non-POST request to `/webhooks/:id` gets `405` with `Allow: POST`. Any other path gets `404`.
- **Delivery order isn't guaranteed.** Up to 10 attempts per tenant run concurrently, and retries go back into the queue. The brief doesn't ask for ordering, and strict per-tenant FIFO would make one bad event block the whole tenant. *Question:* do any destinations assume order?

### Operational limits

Body size, delivery timeout, per-tenant concurrency and backlog cap are constants at the top of `src/main.ts`. They aren't per-tenant config because the brief's config format doesn't include them. They'd be the first things to make configurable.

## Known gaps and what I'd do next

- **Durability.** Everything is in memory as the brief allows, so a restart or crash loses every accepted but undelivered webhook, even though we already told the sender `202`. On `SIGTERM` the service logs how many webhooks it's dropping. A real fix would write each webhook to a durable queue *before* sending `202` (Postgres with `SKIP LOCKED`, SQS, etc.), with delivery workers reading from it. That would also allow running more than one instance.
- **Graceful shutdown** currently stops immediately. It should stop accepting, give in-flight attempts a few seconds to finish, and then exit.
- **Horizontal scaling.** Rate limits are per process. With N instances the effective limit is N× the configured one unless the limiter state is shared (e.g. in Redis).
- **SSRF.** Destinations come from our own config file, so they're trusted today. If tenants could ever set them, we'd need to block private and link-local addresses at connect time, not just by checking the URL.
- **Metrics:** delivery latency, attempts, abandoned deliveries, and backlog depth per tenant. The logs are enough for debugging but not for alerting.
- **Authenticating inbound webhooks.** Right now, anyone who knows a tenant id can push webhooks through to that tenant's destination. I'd want to know how the current inline implementation authenticates senders.
- **Signing outbound requests** (e.g. an HMAC of body + id with a per-tenant secret), so destinations can verify that requests came from us.
