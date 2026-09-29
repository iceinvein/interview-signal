Implement this function in `solution.ts`:

```ts
export function firstOverCapacity(bookings: [number, number, number][], capacity: number): number;
```

A room holds at most `capacity` people. Each booking `[start, end, people]` puts `people` people in the room over the half-open time interval `[start, end)`: they are present at `start` and at every moment up to, but not including, `end`. When one booking ends at the same instant another starts, the people from the ended booking have already left. Return the earliest time at which the total number of people present is greater than `capacity`, or `-1` if that never happens.

Example: with `bookings = [[0, 5, 3], [4, 10, 3], [5, 8, 1]]` and `capacity = 5`, six people are present from time 4, so the answer is `4`. With `capacity = 6` the answer is `-1`: at time 5 the first booking has left, so only four people are present.

Constraints:

- `0 <= bookings.length <= 200000`, in any order
- `0 <= start < end <= 10^9`, integers
- `1 <= people <= 1000`
- `0 <= capacity <= 10^9`

Keep the exported name and signature exactly as shown. `solution.ts` must be self-contained: no imports other than Node built-ins.
