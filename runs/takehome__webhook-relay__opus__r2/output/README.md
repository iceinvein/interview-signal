# Webhook relay

Accepts webhooks at `POST /webhooks/:tenantId`, replies `202` right away, and forwards each
one to the tenant's destination. Failed forwards are retried with exponential backoff. Each
tenant gets its own rate limit and its own delivery queue.

## Running

Requires Node 24. There are no runtime dependencies. Node 24 runs the TypeScript sources
directly through type stripping, so there is no build step. The only dev dependencies are
`typescript` and `@types/node`, used for `npm run typecheck`.

```sh
npm install
PORT=8080 TENANTS_FILE=./tenants.example.json npm start
npm test            # node:test, about 100 ms, no real waiting
npm run typecheck   # tsc --noEmit
```

```sh
curl -i -X POST -H 'content-type: application/json' --data '{"a":1}' localhost:8080/webhooks/acme
# HTTP/1.1 202 Accepted
# {"id":"3b0c…"}
```

## Responses

| Status | When |
|---|---|
| `202` | Accepted. The body is `{"id": "<webhook id>"}`, the same value as `X-Webhook-Id` on the forwarded request. |
| `404` | Unknown tenant, or any path other than `/webhooks/:tenantId`. |
| `405` | A method other than `POST` on a webhook path. |
| `413` | Body larger than 1 MiB. |
| `429` | Over the tenant's `requestsPerSecond`. `Retry-After` gives whole seconds, rounded up. |
| `503` | That tenant's backlog of undelivered webhooks is full. `Retry-After: 1`. |

## Layout

- `src/config.ts`: loads and validates the tenants file. A bad config fails at startup.
- `src/rateLimiter.ts`: sliding-window limiter with an injected clock.
- `src/delivery.ts`: `TenantDeliveryQueue`, which handles attempts, backoff, and per-tenant concurrency. `fetchSender` is the real HTTP client.
- `src/app.ts`: HTTP handling. Wires one limiter and one queue per tenant.
- `src/main.ts`: reads the environment variables and injects the real clock, `setTimeout`, and `fetch`.

Time-dependent code gets its clock (`now`) and its waiting (`sleep`) as injected functions.
The tests pass fakes, so retry and rate-limit behaviour is checked exactly: for example,
"the waits were `[1000, 2000, 4000]`" and "admitted again at exactly t=1000 ms". Nothing
really sleeps, and the timing assertions cannot flake. The one test using real `fetch`
against a real local server also records its backoff waits through a fake `sleep`.

## Decisions

### Request bodies are not logged (this departs from requirement 7)

The brief asks us to log every incoming request with its full body. It also says bodies
routinely contain our tenants' customers' API keys and access tokens. Logging bodies would
copy live third-party credentials into every log pipeline, retention store, and on-call
laptop. That is a large, hard-to-reverse leak for our customers' customers. I don't think a
reviewer would accept it, so I didn't build it.

Here is what gets logged instead, as one JSON line per event:

- **Every incoming request:** tenant, content type, status returned, and the reason for any rejection.
- **Accepted webhooks:** also the webhook id, the body size, and the body's **SHA-256**. On-call can check whether a payload a tenant or provider holds is the one we received, without us holding the payload.
- **Every delivery attempt:** webhook id, attempt number, the destination's status or the connection error, and the next backoff. Also a final `delivery.succeeded` or `delivery.abandoned` event.

That covers the usual questions: did it arrive, did we accept it, what did the destination
say, and did we give up. If on-call really needs payloads, I'd add an explicit, audited
path for that rather than general logs. One option is short-retention encrypted storage
keyed by webhook id, with access logged. Another is per-tenant opt-in capture with known
secret fields redacted. **Question for you:** is there an incident behind this requirement,
where we couldn't debug something without the body? That would tell us which of these to build.

### Rate limiting: sliding-window log

"At most N accepted per second" is taken literally: in any 1-second window, at most
`requestsPerSecond` webhooks are accepted. A token bucket is the usual choice, but with a
burst of N it can accept 2N within one second across a refill boundary. A sliding-window
log costs O(N) memory per tenant, which is trivial at per-second limits. A test checks the
"any window" property directly. Rejected requests don't count against the limit. The check
runs before the body is read, so over-limit senders cost us little. `requestsPerSecond`
must be an integer ≥ 1. **Question:** do any tenants need fractional rates, or a burst
allowance above their steady rate?

The limit runs before the backlog check, so a 503 still uses up one of that second's slots.

### Delivery and isolation

- Each tenant has its own `TenantDeliveryQueue`, with at most 10 concurrent attempts and at most 10,000 pending webhooks. Pending includes webhooks waiting to retry. A dead destination can only fill its own tenant's backlog. After that, the tenant gets `503` and other tenants are unaffected. There is a test with a destination that never responds.
- A webhook waiting out its backoff **does not hold a concurrency slot**. Retries for a failing destination therefore can't starve that tenant's fresh webhooks either.
- Each attempt has a **10 s timeout**. Without one, a destination that hangs would hold a slot forever. **Question:** what timeout do tenants expect?
- **Redirects are not followed.** A `3xx` counts as a failed attempt, per "anything else". Following redirects would let a destination bounce tenant payloads, with their credentials, to a host nobody configured.
- Only `Content-Type` and `X-Webhook-Id` are forwarded. Incoming headers such as `Authorization` and cookies are dropped. The destination's response body is discarded.
- `4xx` responses are retried because the brief says any non-2xx is a failure. **Question:** should we stop retrying on `400`/`404`/`410`, which usually won't change, and honour `Retry-After` on `429`/`503` from destinations?
- **Delivery order is not guaranteed**, because of concurrent attempts and retries. The brief didn't ask for ordering. Destinations get `X-Webhook-Id` for deduplication, and delivery is at-least-once: a timed-out attempt may still have been processed. **Question:** do any tenants rely on order? If so, that means serial delivery per tenant, which trades away throughput.
- The webhook id is a random UUID generated by the relay. It stays the same across retries, but not across a provider re-sending the same event. Deduplicating those needs a provider-specific event id, which is out of scope here.

### Other calls

- Bodies are capped at 1 MiB (`413`). **Question:** what is the largest webhook we see in practice?
- The tenant id is URL-decoded and looked up in a `Map`, so ids like `__proto__` can't match object prototype properties. A malformed encoding gets a 404.
- The config is validated at startup. Tenants can't be reloaded without a restart.
- Destinations aren't checked against private or internal addresses. Tenants are configured by us, not self-serve. If tenants ever set their own URLs, SSRF protection becomes necessary.
- There is no signature verification on incoming webhooks. Anyone who knows a tenant id can post to it. That seems out of scope, but it matters before production (per-provider HMAC checks, or a shared secret per tenant).

## Durability and what I'd do next

All state is in memory, as the brief allows. On a crash or deploy, webhooks that got a
`202` but aren't delivered yet are **lost**, and so is the limiter state. `SIGTERM` stops
accepting new requests but does not drain retries. Some of those retries could be hours
away, so draining isn't a real fix.

Next steps, roughly in order:

1. **A durable queue before sending 202.** Write the webhook to a durable store first, such as Postgres with `SKIP LOCKED`, SQS, or Redis Streams. Then a `202` means "we have it", and retries survive restarts. This also makes it possible to run more than one instance.
2. **Shared rate-limit state** (for example Redis) once there is more than one instance. Otherwise each instance enforces the limit separately.
3. **A dead-letter store and a replay endpoint** for abandoned webhooks.
4. **Metrics** per tenant: accepted, rate-limited, delivery latency, attempts, abandoned, and backlog depth. Plus alerts on backlog growth.
5. **Jitter on backoff**, so retries against a destination that has come back don't all arrive at once. I kept the backoff exact because the brief specifies it.
6. **Per-tenant limits in config**, for concurrency, backlog, and timeout, which are fixed defaults today.
