Implement this function in `solution.ts`:

```ts
export function longestSubstringAtMostTwice(s: string): number;
```

You are given a string `s`. Return the length of the longest contiguous substring of `s` in which no character occurs more than twice. A character may appear once or twice in the substring, anywhere within it, but never three or more times. Characters are compared exactly, so upper and lower case letters are different characters, and a space is a character like any other. For an empty string, return `0`.

Constraints:

- `0 <= s.length <= 100000`
- Every character of `s` is printable ASCII, with a code from 32 (space) to 126 inclusive.

Keep the exported name and signature exactly as shown. `solution.ts` must be self-contained: no imports other than Node built-ins.
