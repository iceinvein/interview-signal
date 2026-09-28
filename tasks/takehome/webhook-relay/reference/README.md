# Webhook relay

Accepts webhooks at `POST /webhooks/:tenantId` and forwards them to each
tenant's destination, with retries, exponential backoff and a per-tenant rate
limit.

## Running

```sh
npm install
PORT=8080 TENANTS_FILE=./tenants.json npm start
npm test
npm run typecheck
```

Node 24 runs the TypeScript directly (type stripping), so there is no build
step. The only dependencies are dev dependencies: vitest, TypeScript and
Node's types.

## Layout

- `src/server.ts`: HTTP handling. Routes, tenant lookup, rate limiting,
  body reading and the 202. Hands accepted events to an injected `dispatch`.
- `src/rateLimiter.ts`: a sliding-window limiter (at most N in any rolling
  second), one instance per tenant, with an injected clock.
- `src/delivery.ts`: the retry loop and backoff schedule, with injected
  `send` and `sleep`, so the tests drive time rather than wait for it.
- `src/forward.ts`: one delivery attempt over `fetch`.
- `src/config.ts`: loads and validates the tenants file; any bad field stops
  startup with the tenant and field named.
- `src/main.ts`: wiring, environment and logging.

## Decisions

**Full request bodies are not logged.** The brief asks for every body to be
logged in full, but it also says payloads carry tenants' customers' API keys
and access tokens. Logging them would copy live credentials into log storage,
where far more people and systems can read them than can read the relay. I
log metadata instead: tenant, event id, content type, size, and each
delivery outcome with its attempt count. That is enough to trace an event
end to end. If on-call needs payloads, I would suggest an opt-in, per-tenant,
short-retention capture with known secret fields redacted, and I would want
to agree that with whoever owns security first.

**Events that exhaust their retries are dropped after a
`delivery.abandoned` log line.** The brief does not say what should happen
to them. Dropping is the only honest option without persistence. In
production I would expect a dead-letter store with a way for tenants to
inspect and replay. Question for product: do tenants need to see failed
events, and for how long?

**No ordering guarantee.** Each event is delivered independently, so a
retried event can arrive after a later one. Serialising per tenant would
preserve order but lets one failing event block that tenant's whole stream
for the length of its retry schedule. Question for product: does any tenant
depend on order? If so, per-tenant FIFO with head-of-line blocking is the
trade-off to discuss, and the `X-Webhook-Id` alone does not let a
destination reorder.

**What counts as a failed attempt.** Any non-2xx, a network error, or no
response within 10 seconds. 4xx responses are retried too, since the brief
says "anything else"; a 410 or 400 may deserve to stop retrying early.

**Rate limit.** A sliding log per tenant: exactly N per rolling second, as
the brief specifies, rather than a fixed window that allows 2N across a
boundary. Rejected requests do not use up a slot. `Retry-After` is the whole
seconds until the oldest counted request leaves the window, at least 1. The
limit is checked before the body is read, so a throttled tenant costs little.

**Other limits.** Bodies over 1 MiB get a 413. State is in memory, as the
brief allows, so deliveries in flight are lost on restart.
