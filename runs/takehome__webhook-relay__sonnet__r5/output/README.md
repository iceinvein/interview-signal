# webhook-relay

Accepts webhooks at `POST /webhooks/:tenantId`, replies `202` immediately, and forwards each one to the tenant's destination with retries. Node 24, TypeScript run directly by Node (type stripping, no build step), **zero runtime dependencies** (`node:http` + global `fetch`). `typescript` and `@types/node` are dev-only, for `npm run typecheck`.

```
npm install
PORT=8080 TENANTS_FILE=./tenants.json npm start
npm test            # 28 tests, ~1s
npm run typecheck
```

Optional env: `DELIVERY_TIMEOUT_MS` (per-attempt timeout, default 10000).

## Layout

| File | Responsibility |
|---|---|
| `src/config.ts` | Load and validate the tenants file (fails startup on bad config) |
| `src/rateLimiter.ts` | Sliding-window limiter, clock injected |
| `src/dispatcher.ts` | Per-tenant queue, concurrency, retry/backoff |
| `src/relay.ts` | HTTP routing and admission (404 → body → capacity → rate limit → 202) |
| `src/main.ts` | Wiring: env, real `fetch` sender, JSON logger, shutdown |

## Decisions

**Body logging (requirement 7): I deliberately did not log bodies.** The brief says payloads routinely contain our tenants' customers' API keys and tokens, and also says to log the full body. Those conflict: bodies in logs would put live credentials into log storage, with wider access and longer retention than the payloads themselves. I log tenant, webhook id, byte length, content type and every delivery outcome, which covers most delivery debugging, and I never log headers (they can carry `Authorization`). A test asserts a secret never reaches the log. **Question I'd ask:** what does on-call actually need the body for? If it's essential, I'd suggest an opt-in per-tenant debug flag with redaction and short retention, or storing bodies in the (access-controlled) retry store rather than in logs, rather than logging everything by default.

**Rate limit:** sliding window (at most N accepted in any 1s span), not a token bucket, since a bucket allows up to ~2N across a refill boundary and the brief says "at most". `Retry-After` is whole seconds, rounded up, minimum 1. Only accepted webhooks use a slot; 404/413/503 rejections don't. Retries are not rate limited (the limit is on *incoming* webhooks).

**Isolation:** each tenant has its own limiter and its own dispatcher (concurrency cap 8, at most 1000 webhooks held). A hung destination can therefore only fill its own tenant's slots and queue; when that's full, only that tenant gets `503` + `Retry-After`. Without a bound, a dead destination would grow memory without limit. A webhook waiting out a backoff holds no concurrency slot. Every attempt has a 10s timeout so a black-holed destination can't pin a slot forever. Caveat: isolation is per-tenant, but all tenants still share one process, one event loop and global memory.

**Retries:** wait `initialBackoffMs`, then double per retry; `maxAttempts` counts the first try. No jitter and no cap (not asked for; jitter would be my first addition, it matters when a destination recovers). Delays are clamped to the 2^31-1 ms `setTimeout` limit, because beyond that Node fires after 1 ms, which would turn a long backoff into an immediate retry. Only `2xx` is success; redirects are *not* followed (`redirect: "manual"`), so a `3xx` is a failed attempt. `4xx` (including 410) is retried too, as specified. Ordering across a tenant's webhooks is not guaranteed.

**Webhook id:** a random UUID per accepted webhook, sent as `X-Webhook-Id` on every attempt and also returned in the `202` response header. Destinations deduplicate on it; delivery is at-least-once.

**Other calls I had to make**
- Unknown tenant → `404` before reading the body. Non-POST on a known tenant → `405`. Tenant ids live in a `Map`, so `/webhooks/constructor` or `__proto__` can't match by accident (tested).
- Body limit 1 MiB → `413` (webhook bodies are opaque but must be bounded since they are buffered for retry). The brief gave no number; I'd ask what the largest real payload is.
- Config is strictly validated at startup (positive integers, http/https URL). Destinations are trusted config; I did not add SSRF filtering (private ranges etc.), which I'd want if tenants could edit them themselves.
- The `Content-Type` header is forwarded verbatim, and omitted if the original had none.
- The `202` means "accepted into memory", not "durably stored".

## Known gaps / what I'd do next
1. **Durability.** Everything is in memory; a restart or SIGTERM drops all queued and pending-retry webhooks (shutdown just exits). Next step is a persistent queue (SQS/Postgres/Redis streams) with the 202 sent only after the write, plus a graceful drain.
2. **Multi-instance:** rate limits and queues are per-process; running N replicas gives N× the limit unless the limiter moves to shared state or traffic is sharded by tenant.
3. Dead-letter visibility for `gave_up` webhooks (currently a log line only), metrics (queue depth, attempts, latency per tenant), and per-tenant concurrency/queue settings in config.
4. Authentication of inbound webhooks (signature verification); today anyone who knows a tenant id can post.
5. Jitter and a backoff cap; honouring `Retry-After` from destinations.

## Tests
Time-dependent behaviour is tested without real waiting: the limiter takes an injected clock, and the dispatcher's backoff uses `node:test` mock timers, asserting the exact boundaries (nothing at delay−1 ms, an attempt at delay ms; 1×, 2×, 4× spacing; no attempt after `maxAttempts`). The HTTP tests cover routing, byte-exact forwarding, 429/`Retry-After` and window sliding, tenant isolation, and log redaction. One end-to-end test spawns the real `npm start` entrypoint against a real failing-then-succeeding destination and checks the stable `X-Webhook-Id`. I mutation-checked the timer clamp test (it fails if the clamp is removed).
