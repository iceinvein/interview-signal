# Webhook relay

Node 24 and npm are required. Install with `npm install`, then run:

```sh
PORT=3000 TENANTS_FILE=./tenants.json npm start
```

For example, `tenants.json` can contain:

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

The service validates this file at startup and exits on invalid configuration. Run `npm test` for the test suite.

## Behavior and decisions

- The request body is handled as bytes. The relay sends the same bytes and `Content-Type` to the destination, if one was supplied. It generates a UUID for each accepted webhook and reuses it as `X-Webhook-Id` on every attempt.
- Each tenant has its own FIFO delivery worker and a rolling one-second rate limiter. A slow destination or retry backoff only holds that tenant's queue. The limiter counts accepted requests only; rejected requests return `429` and `Retry-After` in whole seconds. A destination response in the 200–299 range succeeds; redirects are treated as failures and are not followed.
- Delivery attempts time out after five seconds. Retries occur after `initialBackoffMs`, then twice the previous wait, until `maxAttempts` total attempts have been made. Events that exhaust their attempts are logged and dropped.
- Incoming requests are logged as JSON lines, with the entire body encoded in `bodyBase64` to preserve arbitrary bytes. This includes requests that return `404` or `429`. **These logs contain customer credentials.** Access to stdout logs must be restricted, encrypted and retained briefly in any real deployment. I would ask whether full body logging is truly needed; a safer production design would use selective redaction or short-lived, access-controlled payload capture.
- HTTP destinations are allowed for local testing. Because payloads can contain credentials, I would require HTTPS destinations in production.
- Request bodies and the queue are in memory, without a size or backpressure limit. A restart loses pending events; large requests or sustained delivery outages can exhaust memory. For production I would add request-size and per-tenant queue limits, a durable queue, dead-letter handling, operational metrics and a defined policy for full queues. These are intentionally outside this exercise's scope.

The tests inject a clock and a sleep function so the rolling window and retry delays are checked without waiting for wall-clock time. They also cover opaque payloads, response codes, stable IDs, and tenant isolation.
