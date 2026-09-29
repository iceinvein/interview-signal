Implement this function in `solution.ts`:

```ts
export function serveCustomers(arrivals: number[], durations: number[], servers: number): number[];
```

A shop has `servers` identical servers, every one of them free at time `0`. Customer `i` arrives at time `arrivals[i]` and needs `durations[i]` units of service. Customers are assigned strictly in index order: customer `0` first, then customer `1`, and so on, even when a later customer could have been served sooner. Each customer, when their turn comes, goes to whichever server becomes free earliest (if several are tied, it makes no difference which one). Service starts at the later of the customer's arrival time and that server's free time, ends at start plus duration, and the server is then free again from that end time. A server that becomes free at the same moment a customer arrives can serve them straight away.

Return an array whose element `i` is the time at which customer `i` finishes.

Example: with `arrivals = [0, 0, 0, 0]`, `durations = [10, 1, 1, 1]` and `servers = 2`, customer 0 takes the first server until time 10 and customer 1 takes the second until time 1. Customers 2 and 3 then both use the second server, finishing at 2 and 3. The result is `[10, 1, 2, 3]`.

Constraints:

- `0 <= arrivals.length <= 200000`, and `durations.length === arrivals.length`
- `1 <= servers <= 100000`
- `arrivals` is sorted in non-decreasing order.
- `0 <= arrivals[i], durations[i] <= 10^9`, all integers. Every finish time stays below `2^53`.

Keep the exported name and signature exactly as shown. `solution.ts` must be self-contained: no imports other than Node built-ins.
