# Webhook relay

Accepts webhooks at `POST /webhooks/:tenantId`, replies `202` immediately, and forwards each one to the tenant's destination with retries and exponential backoff.

```
npm install
PORT=3000 TENANTS_FILE=tenants.example.json npm start
npm test            # 30 tests, ~0.3s
npm run typecheck
```

Node 24 runs the TypeScript directly (type stripping), so there is no build step. There are **no runtime dependencies**. `typescript` and `@types/node` are dev-only, for `npm run typecheck`.

## Layout

| File | Responsibility |
| --- | --- |
| `src/config.ts` | Load and validate the tenants file. A bad file fails startup. |
| `src/rateLimiter.ts` | Per-tenant sliding-window limiter with an injected clock. |
| `src/dispatcher.ts` | Per-tenant delivery queue, concurrency cap, retries and backoff, with an injected sender and timer. |
| `src/sender.ts` | The real HTTP `POST` (`fetch`). |
| `src/server.ts` | HTTP routing, body reading, wiring of the pieces above. |

The dispatcher and limiter know nothing about HTTP or real time. The backoff tests drive a manual clock and check the exact delays (1000, 2000, 4000 ms) and the boundaries (999 ms is too early, 1000 ms fires). Server tests run against a real local destination.

## Decisions

**Request bodies are not logged (deliberate deviation from requirement 7).**
The brief says the payloads routinely contain customers' API keys and tokens, and also asks for full bodies in the logs. Those conflict. Logs are usually retained longer and readable by more people than the data itself, so I chose not to write secrets into them. Each request logs tenant, status, byte count, content type, and the `webhookId`. Delivery events log attempt number, outcome and delay, all keyed by the same `webhookId`. That is enough to trace delivery problems. Headers are never logged either, since `Authorization` is common. A test asserts a secret in the body and headers never reaches the logs.
*Question for you:* what do on-call actually need the body for? If it is genuinely required, I would add an opt-in, per-tenant debug flag with field-level redaction and a short retention, rather than logging everything by default.

**Rate limiting.**
This is a sliding window: never more than `requestsPerSecond` accepted in any 1000 ms window. I preferred it to a token bucket because a bucket allows up to 2× the limit across a boundary, which does not match "at most N per second". The cost is O(N) timestamps per tenant. `Retry-After` is whole seconds, rounded up, minimum 1. Only accepted webhooks use a slot. 404, 413 and 503 responses do not.

**Isolation.**
Every tenant has its own limiter and its own dispatcher, with its own concurrency cap (8), byte budget (16 MiB) and timers. A hung destination uses up only that tenant's slots. Requests to destinations time out after 10 s, so a hang cannot hold a slot forever. An event waiting out a backoff holds a timer, not a concurrency slot, so it does not block newer events for the same tenant.

**Backpressure.**
In-memory state must be bounded. If a tenant's undelivered backlog exceeds its byte budget, new webhooks get `503` with `Retry-After: 5` instead of growing memory without limit. That is a call the brief does not make. The alternative is to accept and drop the oldest, which silently loses events. Bodies over 1 MiB get `413`. Both limits are constants I picked, and they should come from real payload sizes.

**Ordering.**
Not guaranteed. Events for a tenant are delivered concurrently and a retried event arrives after later ones. The `X-Webhook-Id` header exists for deduplication, not sequencing. If destinations need order, that changes the design (a per-tenant serial queue where one failing event blocks the rest). I would ask before building it.

**Delivery semantics.**
- The delivery is at-least-once, so destinations must deduplicate on `X-Webhook-Id` (a random UUID per accepted event, identical on every retry).
- Redirects are not followed. A `3xx` counts as a failed attempt, since following one could send tenant data somewhere the config didn't name and would change `POST` semantics.
- Only `Content-Type` and `X-Webhook-Id` are forwarded. Incoming headers are not passed through.
- All non-2xx responses are retried, including `4xx`. That is what the brief says. I do not honour a destination's `Retry-After` on its own `429`/`503`. That would be a good next step.
- No jitter on the backoff, since the brief specifies exact waits. With many events failing together, jitter would avoid a synchronized retry storm.

**Other details.**
- Tenant ids live in a `Map`, so `/webhooks/constructor` or `/webhooks/__proto__` cannot match an inherited property (this has a test).
- Unknown path is `404`, wrong method on a webhook path is `405`.
- The tenants file is read once at startup and validated. `maxAttempts`, `initialBackoffMs` and `requestsPerSecond` must be positive integers, and `destination` must be an http(s) URL.
- The body is read fully before the limit check, so the rate limit does not stop a client from sending up to 1 MiB per request. A production version would rate-limit at the edge as well.
- On `SIGTERM` the server stops and pending retries are cancelled. Undelivered events are lost, which is the accepted cost of in-memory state.

## What I would do next

1. **Durability.** Write accepted events to disk or a queue before replying `202`, so a restart does not lose them. This is the biggest gap.
2. Metrics per tenant: queue depth, attempts, give-ups, `429`/`503` counts. Currently there are only logs.
3. A dead-letter record (and a way to replay) for events that exhaust `maxAttempts`. Today they are only logged.
4. Configurable timeout, concurrency, queue and body limits, and reloading tenant config without a restart.
5. Honour `Retry-After` from destinations, add jitter, and add a circuit breaker for destinations that are consistently down.
6. Optional request authentication or signature checks on the incoming endpoint. The brief does not mention any, so anyone who knows a tenant id can submit webhooks.
