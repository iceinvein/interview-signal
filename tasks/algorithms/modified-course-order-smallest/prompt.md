Implement this function in `solution.ts`:

```ts
export function courseOrder(numCourses: number, prerequisites: [number, number][]): number[];
```

There are `numCourses` courses, numbered `0` to `numCourses - 1`. Each pair `[a, b]` in `prerequisites` means course `b` must be taken before course `a`. Courses are taken one at a time, each exactly once, and a course can be taken only once all of its prerequisites have been taken.

Return an order in which every course can be taken, as an array listing all `numCourses` course numbers. When several orders are valid, return the lexicographically smallest one: compare two orders position by position, and at the first position where they differ, the order with the smaller course number there is the smaller order. If no valid order exists, return an empty array.

A pair `[a, a]` says a course must come before itself, which can never be satisfied. The same pair may appear more than once; a repeated pair means nothing more than a single copy.

Constraints:

- `1 <= numCourses <= 100000`
- `0 <= prerequisites.length <= 200000`
- `0 <= a, b < numCourses`

Keep the exported name and signature exactly as shown. `solution.ts` must be self-contained: no imports other than Node built-ins.
