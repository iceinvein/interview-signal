# webhook-relay

Accepts webhooks at `POST /webhooks/:tenantId`, replies `202`, and forwards them to the tenant's destination with retries and per-tenant rate limiting.

```
npm install
PORT=8080 TENANTS_FILE=./tenants.example.json npm start
npm test            # 21 tests, node:test, no network
npm run typecheck   # tsc --noEmit
```

Node 24. There are **no runtime dependencies**. Node 24 runs `.ts` directly (type stripping), and the built-in `http`, `fetch` and `node:test` cover everything else. `typescript` and `@types/node` are dev-only, for type checking.

## Layout

| File | Responsibility |
|---|---|
| `src/server.ts` | HTTP routing, tenant lookup, rate limiting, body reading, 202/404/429 |
| `src/relay.ts` | Per-event retry loop with backoff, plus the real `fetch` sender |
| `src/rateLimiter.ts` | Sliding-window limiter |
| `src/config.ts` | Loads and validates the tenants file (the service refuses to start on bad config) |
| `src/types.ts` | Shared types, `Clock` and logger |

Time and the network are injected (`Clock`, `Send`). The retry and rate-limit tests therefore use a fake clock and assert exact timestamps (attempts at t=0, 1000, 3000 and 7000 ms) instead of sleeping.

## Decisions

**1. I do not log request bodies, which departs from requirement 7.** The brief asks for the full body in the logs, and also says payloads routinely contain customers' API keys and access tokens. Those two statements conflict. Writing bodies to logs would spread secrets to log storage, to everyone with log access, and to any log vendor, with a retention we don't control. So each request logs tenant, webhook id, content type, byte size, and every delivery attempt's outcome (status or error). It does not log the body or headers. The webhook id lets on-call trace an event across its attempts, and a test asserts that a secret in the payload never reaches the logs.
   *Question I'd ask:* what does on-call actually need from the body? If they need to replay events, the answer is a durable store with access control and a TTL, not the log stream. If they need to see the payload shape, we could log a redacted form, such as JSON keys with values masked. I also log only what we generate, so the destination URL is not logged, since it could embed a token.

**2. Rate limit: a sliding-window log, not a token bucket.** "At most N per second" is enforced exactly. A token bucket lets 2N through across a refill boundary. The limit is checked *before* the body is read, so a flooding tenant costs little. `Retry-After` is the whole seconds until the oldest hit leaves the window (minimum 1). Rejected requests don't consume capacity. A request that is then rejected for size (413) does consume a slot.

**3. Isolation.** Each accepted event is its own async retry loop with its own timers, and there is no shared queue or worker pool. A hung or dead destination can only hold up its own events, and rate limiters are per tenant. The cost is that delivery order is **not** guaranteed, even within one tenant. I judged that acceptable because destinations are told to dedupe by id, but it's a question for the team: does any tenant need ordering?

**4. Backoff.** The first retry waits `initialBackoffMs`, the next twice that, and so on, with no jitter and no cap, as specified. I'd add jitter and a cap in production, to avoid thundering herds after a destination outage. `maxAttempts` includes the first try.

**5. Delivery details.**
- Each attempt has a 10 s timeout, so a black-holed destination can't leak a connection forever. A timeout counts as a failed attempt.
- Redirects are **not followed** and count as failures, because `fetch` turns a redirected POST into a GET and silently drops the payload.
- `X-Webhook-Id` is a UUID assigned at acceptance and reused on every retry.
- The `Content-Type` header is forwarded if present and omitted if absent. Other incoming headers are not forwarded, since they may carry the sender's credentials.
- The destination's response body is discarded.

**6. Other calls I made.**
- Unknown tenant → `404`. Tenants are looked up in a `Map`, so ids like `constructor` or `__proto__` are unknown, not accidental hits.
- Non-POST on a known tenant → `405`.
- Bodies over 1 MiB → `413`, since "opaque bytes" still needs a bound. The limit is a constructor option, not yet configurable via env.
- The unknown-tenant check comes before the rate limit, and there is no limiting of unknown tenants. That's fine for a demo, but in production an attacker could probe tenant ids.
- Config is validated at startup (URL scheme, positive integers). A tenant with a bad value stops the service from starting, which seemed safer than silently skipping it.

## Known gaps and what I'd do next

- **Durability.** Pending retries are in memory and are lost on restart or crash. SIGTERM logs how many are undelivered but does not drain them. Next step: a persistent queue (SQS, or Postgres with `SELECT … FOR UPDATE SKIP LOCKED`) written *before* the 202, with retry state stored in it. That would also fix the fact that today a 202 means "in memory", not "safe".
- **Unbounded pending work.** Nothing caps how many events are retrying for a dead destination. The rate limit and `maxAttempts` bound it in practice (roughly `rps × total retry time`), but I'd add a per-tenant cap that sheds load with a `503`. I'd also add a per-tenant concurrency limit, so a destination that answers slowly doesn't get hit with hundreds of parallel requests.
- **Authentication.** Anyone who can reach the service can post for any tenant. Real senders should be verified, for example with an HMAC signature check per tenant.
- **Multiple instances.** Rate limits are per process. Running more than one replica multiplies the effective limit unless the state is shared (Redis) or routing is sticky per tenant.
- **Ops.** No metrics or health endpoint, and destination URLs are trusted as configured (SSRF isn't a concern while only operators write the file).
- **Tests.** There is no test using a real destination server. I smoke-tested that by hand (retry, 429 and 404 all behaved), but automated coverage stops at the injected `Send`. `httpSend` (timeout, redirect handling) is therefore untested in CI.
