# Take-home: webhook relay

Thanks for moving on to the take-home stage with us at Larkfield. This exercise is a cut-down version of a service we actually run. We expect it to take three to four hours; please don't spend much longer than that. If you run out of time, tell us what you would do next rather than rushing it.

## Background

Larkfield connects our tenants (the businesses that use our platform) to the third-party services they rely on. Those services send us webhooks, and we pass each one on to an endpoint the tenant controls. The payloads come straight from our tenants' integrations and routinely include their customers' API keys and access tokens.

Today the forwarding happens inline in our main application. When one tenant's endpoint is slow or down, everyone's webhooks back up behind it. We want to move this into a small standalone relay.

## What to build

An HTTP service in Node.js and TypeScript that:

1. Accepts webhooks at `POST /webhooks/:tenantId`. The body may be any content type; treat it as opaque bytes.
2. Replies `202 Accepted` once it has accepted a webhook, without waiting for delivery. Webhooks for a tenant it does not know get a `404`.
3. Forwards each accepted webhook to the tenant's destination URL as a `POST` with the same body and `Content-Type`. Every forwarded request carries an `X-Webhook-Id` header identifying the event. The id stays the same on every retry of that event, so destinations can deduplicate.
4. Treats any `2xx` from the destination as delivered. Anything else, including connection errors, is a failed attempt. Failed attempts are retried with exponential backoff: wait `initialBackoffMs` before the first retry, and double the wait for each retry after that. A tenant's `maxAttempts` includes the first try.
5. Enforces a per-tenant rate limit on incoming webhooks: at most `requestsPerSecond` webhooks accepted per second per tenant. Webhooks over the limit get a `429` with a `Retry-After` header and are not forwarded.
6. Keeps tenants isolated. One tenant's slow or failing destination, or one tenant hitting its rate limit, must not delay or reject anybody else's webhooks.
7. Logs each incoming request, including its full body, so on-call can debug delivery problems.

Tenants are configured in a JSON file that the service reads at startup:

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

State can live in memory for this exercise. We don't need persistence across restarts, and we'll talk about durability in the follow-up conversation.

## How we'll run it

We will run `npm install` and then `npm start`, which must start the service listening on the port given in the `PORT` environment variable, reading tenant configuration from the file path given in `TENANTS_FILE`. `npm test` should run your tests. We use Node 24. Libraries are fine, but keep dependencies to ones you would defend in a code review.

## What to send back

- Your source code and tests.
- A `README.md` covering how to run it and the decisions you made. This brief does not settle everything. Where you had to make a call, tell us what you chose and why, or write down the question you would have asked us.

## What we look at

Correctness comes first. After that we look at how clearly the code is organised, how well your tests pin down the behaviour (especially the parts that depend on time), and the judgement you show in the README. A smaller service that is solid beats a bigger one with gaps.

Good luck, and thanks for your time.
