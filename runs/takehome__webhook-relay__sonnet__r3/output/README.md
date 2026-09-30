# Webhook relay

`POST /webhooks/:tenantId` → `202`, then forward to the tenant's destination with retries.
Node 24, TypeScript, **no runtime dependencies** (Node runs `.ts` directly; `typescript` and `@types/node` are dev-only, for `npm run typecheck`).

```
npm install
PORT=8080 TENANTS_FILE=./tenants.example.json npm start
npm test            # 29 tests, no real sleeping in the time-dependent ones
npm run typecheck
```

## Layout

| File | Responsibility |
|---|---|
| `src/config.ts` | Load and validate the tenants file (fails fast at startup) |
| `src/rateLimiter.ts` | Per-tenant sliding-window limiter (pure, time passed in) |
| `src/delivery.ts` | Attempt + exponential-backoff retry state machine for one webhook |
| `src/sender.ts` | The actual HTTP attempt (`fetch`) |
| `src/relay.ts` | Ties tenants, limiter, backlog cap and deliverer together |
| `src/server.ts` | HTTP layer: routing, body reading, status codes, request logging |

Time is injected (`Clock`), so tests drive retries and the rate window with a fake clock, and assert exact attempt times (`0, 1000, 3000, 7000` ms).

## Decisions

**The body is not logged (deviates from requirement 7).** The brief says to log each request "including its full body", but also says payloads routinely contain customers' API keys and tokens. Logging them would put live credentials into log storage, where far more people and systems can read them than can read the webhook itself. I log tenant, webhook id, byte count, content type and outcome instead, which is enough to trace a delivery. If on-call really needs bodies, my proposal would be an opt-in, per-tenant, time-boxed debug flag with redaction and short retention. *Question I'd ask: what does on-call actually need to see when debugging?* Destination URLs are also not logged (they may embed tokens); attempt logs carry status code or error class only.

**Rate limit is a sliding window**, not a token bucket: never more than `requestsPerSecond` accepted in any 1000 ms window. A token bucket with burst = N can admit ~2N across a refill boundary, which reads as a violation of "at most N per second". Cost: memory of up to N timestamps per tenant. `Retry-After` is whole seconds, rounded up (min 1), computed from when the oldest counted request leaves the window. Rejected requests don't consume capacity. Ordering: unknown tenant → 404 first, then body read, then limit check.

**Isolation.** Each tenant has its own limiter and backlog counter, and each webhook has its own independent retry timer chain, so a hung destination delays nothing else (even for the same tenant, so a slow event doesn't head-of-line block later ones; the trade-off is that ordering is not preserved, so destinations must not assume in-order delivery). Each attempt has a 10 s timeout so a hanging destination can't hold resources forever.

**Bounded memory.** In-memory retry state grows with a dead destination, so each tenant is capped at 1000 undelivered webhooks; beyond that that tenant alone gets `503` + `Retry-After`. Bodies are capped at 1 MiB (`413`). Both numbers are guesses. *Question: what are real max payload sizes and burst sizes?* Concurrency per destination is currently unbounded up to the cap; a per-destination concurrency limit would be kind to slow tenants' servers.

**Retry semantics.** Delay before retry *k* is `initialBackoffMs × 2^(k-1)`; `maxAttempts` includes the first try. No jitter, since the brief specifies exact waits (I'd add jitter in production to avoid synchronized retries). Non-2xx, network errors and timeouts are failures. Redirects are **not followed**: a 3xx is a failed attempt. No special-casing of 4xx: `400`/`410` are retried like everything else, as the brief says "anything else". `initialBackoffMs: 0` is allowed (immediate retries).

**Webhook id** is a random UUID assigned on acceptance, sent as `X-Webhook-Id` on every attempt and also returned in the `202` response header (handy for support). The relay does not dedupe incoming duplicates from the third party; there's no reliable key in an opaque body.

**Body/headers.** Body is forwarded byte-for-byte. `Content-Type` is forwarded if present and omitted if absent. Other incoming headers (e.g. third-party signatures) are *not* forwarded: the brief specifies only these two. *Question: do tenants need signature headers passed through?* Note that relaying doesn't preserve the original signature's validity anyway if the tenant verifies against a different URL.

**Config.** Validated at startup (positive integers, http(s) destination); the process exits non-zero on bad config. Tenants live in a `Map`, so ids like `constructor`/`__proto__` are 404, not accidents. Destinations are trusted operator config, so there's no SSRF filtering; if tenants could self-serve destinations that would be needed (block private/link-local ranges, pin resolved IPs).

**Other.** `405` for non-POST on a webhook path; `404` for other paths. Structured JSON logs to stdout. On SIGTERM the process exits immediately; pending retries are lost (allowed by the brief).

## What I'd do next

- Durability: persist accepted webhooks *before* the `202` (queue or DB) and rebuild retry timers on start; today a crash after `202` loses the event.
- Per-destination concurrency limits and a circuit breaker; jitter; a dead-letter store and an endpoint/metric for it.
- Metrics (accepted/429/503, attempt outcomes, backlog depth per tenant) instead of relying on logs.
- Graceful shutdown that drains in-flight attempts; multi-instance would need a shared rate limiter (Redis) or sticky routing by tenant.
- Better error classification in logs (`fetch` wraps the network error code in nested causes; I currently log only a coarse class).
- Config reload without restart; auth or signature verification on the inbound endpoint (currently anyone who knows a tenant id can post).
