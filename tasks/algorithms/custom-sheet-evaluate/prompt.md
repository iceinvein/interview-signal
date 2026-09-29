Implement this function in `solution.ts`:

```ts
export function evaluateSheet(cells: Record<string, string>): Record<string, number | "#CYCLE">;
```

You are given the filled cells of a spreadsheet as an object mapping each cell name to its content. A cell name is one or more uppercase letters followed by a row number, such as `A1`, `Z9` or `AB12`; the row number has no leading zeros, so each cell has exactly one spelling. Each content string is one of:

- an integer literal: optional `-` followed by digits, such as `"42"`, `"0"` or `"-7"`.
- a formula: `=` followed by one or more terms joined by `+`, with no spaces. Each term is either an integer literal (which may be negative, as in `"=A1+-3"`) or a cell name.

A literal cell's value is its number. A formula cell's value is the sum of its terms, where a cell name term contributes that cell's value. A cell name that is not a key of `cells` is an empty cell and contributes `0`.

Cell `X` depends on cell `Y` if `Y` appears in `X`'s formula, or in the formula of any cell `X` depends on. A cell is on a cycle if it depends on itself. A cell that is on a cycle, or depends on any cell that is on a cycle, has no numeric value: its result is the string `"#CYCLE"`. Every other cell gets its number.

Return an object with exactly the same keys as `cells` (no entries for empty cells), each mapped to that cell's number or `"#CYCLE"`.

Example: for `{ A1: "=B1+C1", B1: "=A1", C1: "4", D1: "=C1+E1+-1" }`, cells `A1` and `B1` depend on each other, `C1` is `4`, and `D1` is `4 + 0 - 1` because `E1` is empty, so the result is `{ A1: "#CYCLE", B1: "#CYCLE", C1: 4, D1: 3 }`.

Constraints:

- `0 <=` number of keys `<= 100000`
- The total length of all content strings is at most `2 * 10^6`.
- Every integer literal is between `-10^9` and `10^9`, written without leading zeros and never as `-0`.
- Every numeric result, and every sum computed along the way, is between `-10^15` and `10^15`.

Keep the exported name and signature exactly as shown. `solution.ts` must be self-contained: no imports other than Node built-ins.
