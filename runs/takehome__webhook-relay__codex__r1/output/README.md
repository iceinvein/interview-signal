# Webhook relay

A small Node 24 / TypeScript HTTP service. It accepts webhooks into in-memory per-tenant queues and delivers them in the background.

## Run

```sh
npm install
PORT=3000 TENANTS_FILE=./tenants.json npm start
```

`TENANTS_FILE` must be a JSON file in this form:

```json
{
  "tenants": {
    "acme": {
      "destination": "https://hooks.acme.example/relay",
      "maxAttempts": 5,
      "initialBackoffMs": 1000,
      "requestsPerSecond": 20
    }
  }
}
```

Send a webhook with `POST /webhooks/acme`. Accepted requests return `202` and an `X-Webhook-Id` response header. Unknown tenants return `404`. Rate-limited requests return `429` with `Retry-After` in whole seconds. Both rejected and accepted requests are logged.

Run the tests with `npm test`.

## Decisions

- Incoming bodies are buffered as bytes. Delivery uses the same bytes and the incoming `Content-Type`, if present. Request logs are JSON lines with the complete body in `bodyBase64`, so even invalid UTF-8 is preserved. This also means secrets in webhook bodies are present in the logs in reversible form. Access to these logs needs strict controls and short retention. I would confirm the full-body logging requirement and retention policy before production use.
- Rate limiting uses a rolling one-second window, counted when a complete request is accepted. The oldest accepted request determines `Retry-After`, rounded up to at least one second. Each tenant has its own window.
- Each tenant has a separate FIFO delivery queue and worker. Delivery is sequential within a tenant; a slow or failing tenant does not hold up another tenant. The HTTP response does not wait for delivery. An outbound attempt times out after 10 seconds so a permanently stalled destination cannot hold its own queue forever.
- Any `2xx` succeeds. Redirects are not followed and count as failures. Each failure, including a network error or timeout, consumes one of `maxAttempts`. Delays before retries are `initialBackoffMs`, then twice that for every subsequent retry. An event keeps one random UUID across attempts. Delivery outcomes are logged with tenant, event ID, attempt and status or error.
- Invalid tenant settings fail startup. Destinations must use HTTP or HTTPS; attempt and rate limits must be positive integers. `initialBackoffMs` can be zero.

This exercise uses volatile queues and rate windows, so a process crash or restart loses accepted work. It also has no body-size or queue-size limit; an overloaded process can run out of memory. For a production service I would add a durable queue, bounded intake with backpressure, operational metrics, and a configurable request-size limit. These would need an agreed policy for how to respond when the queue is full.
