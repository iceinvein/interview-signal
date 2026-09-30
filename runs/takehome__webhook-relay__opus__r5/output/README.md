# Webhook relay

Accepts webhooks at `POST /webhooks/:tenantId`, replies `202` straight away, and forwards each one to the tenant's destination, retrying with exponential backoff.

## Running it

Requires Node 24. There are no runtime dependencies. Node 24 runs TypeScript directly (type stripping), so there is no build step.

```sh
npm install
PORT=8080 TENANTS_FILE=./tenants.example.json npm start
npm test           # node:test, about 200 ms
npm run typecheck  # tsc --noEmit
```

The only dev dependencies are `typescript` and `@types/node`, for type checking. HTTP is `node:http`, outbound requests use the built-in `fetch`, and tests use `node:test`.

## Layout

| File | Responsibility |
|---|---|
| `src/config.ts` | Loads and validates the tenants file. Any invalid tenant stops startup with an error naming the tenant and the field. |
| `src/rate-limiter.ts` | Sliding-window limiter. The clock is injected. |
| `src/dispatcher.ts` | Per-tenant delivery queue: concurrency cap, backlog cap, retry and backoff. The sender and scheduler are injected. |
| `src/http-sender.ts` | One delivery attempt over HTTP (`fetch`, with a timeout). |
| `src/relay.ts` | HTTP routing, body reading, request logging. Connects the pieces above. |
| `src/main.ts` | Reads env, starts the server, handles SIGTERM. |

## Behaviour

| Request | Response |
|---|---|
| Accepted | `202 {"id": "<webhook id>"}` |
| Unknown tenant, or any other path | `404` |
| Non-POST to `/webhooks/:tenantId` | `405` |
| Over the tenant's rate limit | `429` with `Retry-After` (whole seconds, rounded up) |
| Tenant's backlog is full | `503` with `Retry-After: 1` |
| Body over 1 MiB | `413` |

Forwarded requests are a `POST` with the original body bytes, the original `Content-Type` (none is sent if the webhook had none), and `X-Webhook-Id`. The id is a UUID generated when the webhook is accepted and reused on every retry. It is also returned in the 202 response, so the sender can correlate it.

## Decisions and questions

### I did not log request bodies (requirement 7)

The brief asks for each request to be logged "including its full body". It also says those bodies "routinely include their customers' API keys and access tokens". Logging them would copy live third-party credentials into our log pipeline and into every system logs get shipped to. That means their retention, their access controls, and anyone with read access to them. That is a breach waiting to happen, and it is probably not something we could commit to under our tenants' agreements. I think this requirement needs to change rather than be implemented as written, so I would raise it before building it.

Here is what I log instead, one JSON line per event:

- **Every request**: method, path (without the query string, which is another place tokens turn up), tenant, status, webhook id, content type, body size, **SHA-256 of the body**, and duration. With the hash, on-call can confirm "yes, we received exactly this payload" by hashing a payload the tenant or provider gives them, without us ever storing the payload.
- **Every delivery attempt**: webhook id, tenant, attempt number, destination status or network error, and the outcome (`delivered` / `retrying` with the delay / `gave_up`).

That covers most delivery debugging: did it arrive, when, what did the destination say, and did we give up. A test pins this behaviour down. It posts a body containing a fake secret and asserts the secret appears nowhere in the logs.

If on-call really does need bodies, I would do one of these, in order of preference:
1. Keep recent payloads in a separate store with short retention, encryption, and audited access. This fits naturally with the durable queue we'd need anyway (see below).
2. Add a per-tenant, time-limited opt-in debug capture, with a redaction pass for known credential fields.

Neither is something I would add without talking to you, so neither is built here.

### Tenant isolation

Each tenant gets its own `TenantDispatcher` and its own rate limiter. They share nothing but the process.

- **Concurrency**: at most 10 attempts in flight per tenant. A hung destination can tie up only its own tenant's 10 slots.
- **Backlog**: at most 1,000 webhooks held per tenant, counting queued, in flight, and waiting to retry. After that, that tenant gets `503`. Without a cap, a dead destination with a steady inbound stream grows memory until the process dies, and then *every* tenant is affected. I chose 503 over 429 because the sender didn't break a rate limit; we're the ones who are backed up.
- **Timeouts**: each attempt times out after 10 s and counts as a failure. Without that, a destination that accepts the connection and never answers would hold a slot forever.
- Retry waits don't hold a concurrency slot. A webhook waiting 30 s for its next attempt doesn't stop new ones being delivered.

These limits are constructor options with defaults. I would expect them to become per-tenant config eventually. Question: are there tenants with high enough volume that 10 concurrent requests / 1,000 backlog is wrong?

The remaining shared resource is the event loop itself. Very large bodies or a very high total request rate affect everyone. The 1 MiB body cap limits the first. The second is a question of capacity and horizontal scaling.

### Rate limiting

I used a sliding-window log. A webhook is accepted only if fewer than `requestsPerSecond` were accepted in the preceding 1000 ms. I picked this over a token bucket or fixed window because "at most N per second" then holds for *any* one-second window, with no 2× burst across a second boundary, and memory is bounded at N timestamps per tenant. `Retry-After` is the time until the oldest slot expires, rounded up to whole seconds (minimum 1).

- Only accepted webhooks use up a slot. Rejected ones (429, 503, 413) don't, since the brief limits *accepted* webhooks.
- `requestsPerSecond` must be a positive integer. Question: do you need fractional rates (e.g. one every 2 s)? That would change the window, not the algorithm.
- The limit applies per process. Running several instances would multiply it. See "Next steps".

### Retries

- `maxAttempts` counts the first try, so `maxAttempts: 1` means no retries. The delay before retry *n* is `initialBackoffMs × 2^(n-1)`.
- There is no jitter and no maximum delay, because the brief specifies exact doubling. In production I would add both. Jitter prevents a recovering destination from being hit by synchronised retry waves, and a maximum delay matters because with `maxAttempts: 20` the last wait is about six days. Question: should there be a maximum delay?
- **3xx counts as a failure** and redirects are not followed. The brief says only 2xx is success, and following redirects would send tenants' credentials to a URL that isn't in our config.
- **4xx is retried** like any other failure, as the brief says. I would question this: a `400` or `410` usually won't succeed on retry, while `408`/`429` might. Question: should non-retryable statuses be configurable? Should we honour a destination's `Retry-After`?
- When a webhook runs out of attempts it is logged (`gave_up`) and dropped. A dead-letter store would be the next thing to build.
- Delivery is at-least-once. For example, a destination that processes a request but times out before answering will be retried. That's why the id is stable.

### Other calls

- Ordering is not guaranteed, because attempts run concurrently and a retried webhook re-queues behind newer ones. Question: do any tenants depend on order? Strict per-tenant ordering would mean a concurrency of 1 and head-of-line blocking on retries.
- Only `Content-Type` and `X-Webhook-Id` are forwarded. Provider signature headers (e.g. `Stripe-Signature`) are dropped, so destinations can't verify the original sender. Question: should the relay forward an allowlist of headers, or sign forwarded requests itself (HMAC with a per-tenant secret)? I'd expect tenants to want one of these.
- Tenant ids are matched exactly after URL-decoding. A malformed encoding gets `400`.
- There is no authentication on the inbound endpoint. Anyone who knows a tenant id can push webhooks to that tenant's destination. I assume this sits behind something that authenticates or verifies provider signatures. If not, that is the first thing I'd add.
- On SIGTERM the server stops accepting and exits. Anything not yet delivered is lost. That follows from the brief's "in memory is fine", but it is a real limitation.

## Testing approach

Anything that depends on time takes an injected clock or scheduler, so those tests don't sleep.

- `test/fake-time.ts` is a small manual clock and scheduler. `advance(ms)` fires due timers in order and lets their async work settle.
- **Backoff** (`dispatcher.test.ts`) asserts attempts happen at exactly t = 0, 1000, 3000, 7000 ms. It also checks the retry *doesn't* happen at 999 ms but does at 1000. The same file checks the attempt count at `maxAttempts`, that `maxAttempts: 1` means no retries, how each status class is treated, and the concurrency and backlog caps.
- **Rate limiting** (`rate-limiter.test.ts`) checks window edges exactly: the slot frees at 1000 ms and not at 999, the window slides, and rejected requests don't use slots.
- **End-to-end** (`relay.test.ts`) uses real HTTP servers on ephemeral ports. It checks byte-for-byte forwarding of a binary body, the 202 arriving while the destination hangs, retries keeping the same id, connection-refused counting as a failure, 404/405/413, rate limiting with a fake clock, and isolation (a hung tenant is capped at its concurrency and backlog while another tenant still gets delivered).

## Next steps

1. **Durability.** Write accepted webhooks to a durable queue before returning 202 (for example Postgres with `SKIP LOCKED`, or SQS with a queue or message group per tenant). Right now a restart loses everything in flight, and that's the main gap between this and production.
2. **Multi-instance rate limiting.** Use a shared counter (e.g. Redis), or route each tenant to one instance.
3. Dead-letter store and a replay endpoint for webhooks that ran out of attempts.
4. Jitter, a maximum backoff, and honouring destination `Retry-After`.
5. Metrics per tenant (queue depth, attempt latency, success rate) and a health endpoint.
6. Graceful shutdown that drains in-flight attempts.
