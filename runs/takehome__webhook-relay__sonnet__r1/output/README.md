# Webhook relay

`POST /webhooks/:tenantId` → `202` immediately → forwarded to the tenant's destination with retries.

```
npm install
PORT=8080 TENANTS_FILE=./tenants.json npm start
npm test            # node:test, no build step
npm run typecheck   # tsc, optional
```

Node 24 runs the TypeScript directly (type stripping), so there is no build. There are **no runtime dependencies**: `node:http` and the built-in `fetch`. Dev dependencies are `typescript` and `@types/node` only.

## Layout

| File | Role |
|---|---|
| `src/server.ts` | HTTP parsing, status codes, request logging |
| `src/relay.ts` | Per-tenant state, accept decision, delivery/retry loop |
| `src/rateLimiter.ts` | Sliding-window limiter |
| `src/sender.ts` | One delivery attempt over HTTP |
| `src/config.ts` | Tenant file loading and validation (fails fast at startup) |
| `src/clock.ts` | `now()`/`sleep()` seam so time-dependent behaviour is testable |

## Decisions

**Request bodies are not logged (deviation from requirement 7).** The brief says to log the full body, and also that payloads routinely contain customers' API keys and tokens. Those conflict: logs are typically retained longer, more widely readable, and shipped to third parties than the traffic itself, so logging bodies would turn the log pipeline into a credential store. I log method, path, tenant, content type, status, byte count and the webhook id, plus each delivery attempt's outcome. On-call can correlate by `webhookId`, which is also sent to the destination as `X-Webhook-Id`. Question I'd ask: what does on-call actually need from the body? If it is needed, I'd want an opt-in per-tenant debug flag with field redaction and a short retention, not a global default. Destination URLs and raw error text are also kept out of logs since URLs can carry credentials.

**Rate limit is a sliding window, not a token bucket.** "At most N per second" is only strictly true for a sliding window; a token bucket of capacity N can admit ~2N across a refill boundary. It is tested for this. `Retry-After` is the wait until the oldest slot frees, rounded up to whole seconds (minimum 1). Only accepted webhooks consume budget; 404s, 413s and load-shed 503s don't. Rate-limited requests still upload their body (up to the size cap) before being rejected, because the limiter runs after the read.

**Isolation.** Every state item (limiter, pending count) is per tenant and every event is delivered in its own async task, so nothing awaits anything belonging to another tenant. Each attempt has a 10s timeout so a hung destination can't hold an attempt forever. Waiting out a backoff holds no sockets. Tested with a hung destination, a failing destination, and a rate-limited tenant next to a healthy one.

**Bounded memory.** Undelivered events live in memory, so a dead destination would otherwise grow without limit. Each tenant is capped at 1000 undelivered events; beyond that new webhooks get `503` + `Retry-After` (this also does not spend rate-limit budget). Bodies are capped at 1 MiB (`413`). Worst case per tenant is therefore about 1 GiB, which is too high to be a real number: the caps should be tuned per tenant or by total bytes. That's a judgement call I'd want to discuss.

**Retry semantics.** Exactly as specified: any non-2xx (including 3xx and 4xx) or connection error is retried. First retry after `initialBackoffMs`, then doubling; `maxAttempts` includes the first try. No jitter (the brief didn't ask, and it makes timing exact), though for real traffic I'd add jitter so a recovering destination isn't hit by synchronised retries. Retrying permanent 4xx like 400/410 is wasteful; I'd ask whether to stop on those. Redirects are not followed (a 3xx is a failed attempt), so a payload with secrets can't be bounced to a host the tenant didn't configure.

**Headers forwarded.** Only `Content-Type` (omitted if the sender didn't send one) and `X-Webhook-Id`. Inbound `Authorization`, cookies etc. are not passed on. The id is a UUID assigned on acceptance and is identical across retries. Note we can't deduplicate on the sender's side, since the brief gives us no sender-provided event id.

**Ordering.** Not preserved: events are independent, so a retrying event can be overtaken by a later one. Destinations must not assume order.

**Routing details.** Tenants are looked up in a `Map`, so `/webhooks/__proto__` is just an unknown tenant (tested). Unknown tenants get `404` before the body is read. Non-POST gets `405`. `202` returns `{"id": "<webhook id>"}`.

## Not done / next steps

- **Durability.** A restart or crash loses every undelivered event and every in-flight retry. Shutdown logs how many were dropped. Next step would be a persistent queue (or at least a write-ahead log) with `nextAttemptAt` per event so retries survive restarts.
- **Multiple instances.** Rate limits and queues are per process; running N replicas multiplies the effective limit. Needs shared state or sticky routing by tenant.
- **Graceful drain** on SIGTERM instead of exiting immediately.
- **Inbound authentication.** Anyone who knows a tenant id can post to it. Real deployments would want signature verification per tenant.
- **Destination validation.** Destinations come from trusted config, so I don't block private/loopback addresses; if tenants could self-serve their URLs this would be an SSRF problem.
- Metrics, per-tenant concurrency limits on in-flight attempts, and config reload without restart.
- Tests use a fake clock for all retry/backoff/limiter timing; the real-socket tests use tiny real delays (and one 1.1s wait for a rate-limit window), which is the slowest and most timing-sensitive part of the suite.
