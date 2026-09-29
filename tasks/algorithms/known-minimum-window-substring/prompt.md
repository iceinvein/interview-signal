Implement this function in `solution.ts`:

```ts
export function minWindow(s: string, t: string): string;
```

You are given two strings `s` and `t`. Return the shortest contiguous substring of `s` that contains every character of `t`, counting repeats: if `t` holds a character twice, the substring must hold it at least twice (for `t = "aab"` the substring needs two `a` characters and one `b`). The characters may appear in any order within the substring, and the substring may contain other characters as well.

If no substring of `s` qualifies, return the empty string `""`. If several qualifying substrings share the shortest length, return the one that starts at the smallest position in `s`.

Constraints:

- `1 <= s.length, t.length <= 100000`
- `s` and `t` consist of ASCII letters (`a` to `z` and `A` to `Z`) only.
- Comparison is case-sensitive: `"a"` and `"A"` are different characters.

Keep the exported name and signature exactly as shown. `solution.ts` must be self-contained: no imports other than Node built-ins.
