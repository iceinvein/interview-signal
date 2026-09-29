Implement this function in `solution.ts`:

```ts
export function canFinish(numCourses: number, prerequisites: [number, number][]): boolean;
```

There are `numCourses` courses, numbered `0` to `numCourses - 1`. Each pair `[a, b]` in `prerequisites` means course `b` must be taken before course `a`. Courses are taken one at a time, and a course can be taken only once all of its prerequisites have been taken. Return `true` if there is some order in which every course can be taken, and `false` otherwise.

A pair `[a, a]` says a course must come before itself, which can never be satisfied. The same pair may appear more than once; a repeated pair means nothing more than a single copy.

Constraints:

- `1 <= numCourses <= 100000`
- `0 <= prerequisites.length <= 200000`
- `0 <= a, b < numCourses`

Keep the exported name and signature exactly as shown. `solution.ts` must be self-contained: no imports other than Node built-ins.
