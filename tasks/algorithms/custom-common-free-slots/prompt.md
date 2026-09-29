Implement this function in `solution.ts`:

```ts
export function commonFreeSlots(
  busy: [number, number][][],
  dayStart: number,
  dayEnd: number,
  minLength: number,
): [number, number][];
```

You are finding meeting times for a group. `busy[p]` lists the times person `p` is busy. Each busy interval `[s, e]` is half-open: it covers every time `t` with `s <= t < e`. A person's intervals may come in any order and may overlap or repeat.

The day is the half-open range from `dayStart` (included) to `dayEnd` (excluded). A time is free when it lies in the day and nobody is busy at it. Busy intervals may start before `dayStart` or end after `dayEnd`; only the part inside the day matters.

Return every maximal free interval `[start, end]` (again half-open, so `start` is free and `end` is not, and it cannot be extended in either direction while staying free and inside the day) whose length `end - start` is at least `minLength`, sorted by `start` in ascending order. Two busy intervals that merely touch, such as `[1, 3]` and `[3, 5]`, leave no free time between them. If there are no people, or nobody has any busy intervals, the whole day is one free interval. Return `[]` if no free interval is long enough.

Example: `commonFreeSlots([[[1, 3], [8, 9]], [[2, 5]]], 0, 10, 2)` has free intervals `[0, 1]`, `[5, 8]` and `[9, 10]`; only `[5, 8]` has length at least 2, so the result is `[[5, 8]]`.

Constraints:

- `0 <= busy.length <= 1000`
- The total number of busy intervals across all people is at most 200000.
- All times are integers with `0 <= s < e <= 10^9` and `0 <= dayStart < dayEnd <= 10^9`.
- `1 <= minLength <= 10^9`

Keep the exported name and signature exactly as shown. `solution.ts` must be self-contained: no imports other than Node built-ins.
