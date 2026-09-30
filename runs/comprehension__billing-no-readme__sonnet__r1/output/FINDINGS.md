# Review of billing.ts

## Bugs

### 1. Tier width uses the cumulative cap, so tiers overcharge (lines 217-221)
`UsageTier.upTo` is a cumulative cap (see the doc comment on line 12 and the "caps must strictly increase" check on line 101). `usageCharge` uses `tier.upTo` as the tier's *width* (line 217). It should be `tier.upTo - previousCap`. `previousCap` is tracked on line 221 but never read.
Example: tiers `[{upTo: 100, $1}, {upTo: 200, $0.50}, {upTo: null, $0.25}]` with 250 billable units. The code takes 100 at $1, then `min(150, 200)` = 150 at $0.50, so the third tier is never reached. Correct: 100 at $1, 100 at $0.50, 50 at $0.25.

### 2. Credit is deducted twice on finalise (lines 261, 294)
`buildInvoice` calls `applyCredit` (line 261), which subtracts from `account.creditBalanceCents`. `finaliseInvoice` then subtracts `creditAppliedCents` again (line 294). Finalising consumes twice the credit used, and the balance can go negative.

### 3. `previewInvoice` mutates the account (lines 261, 282)
The doc comment on line 274 says preview happens "without changing the account". It goes through `buildInvoice`, which calls `applyCredit` and reduces the credit balance (line 235). Every preview burns credit. Fix bugs 2 and 3 together: `buildInvoice` should only compute the credit to apply, and only `finaliseInvoice` should deduct it.

### 4. Proration uses the used share, not the unused share (lines 182, 188-193)
`prorationFactor` returns the share of the period already used (line 138). `changePlan` names it `unused` and applies it to both lines. Both lines need `1 - used`. A change on day 1 (factor about 0) yields about $0 in adjustments, and a change on the last day yields nearly a full month refund of the old plan and a full month of the new one. That is backwards.

### 5. `formatMoney` does not pad the cents (line 304)
`abs % 100` is not zero-padded, so 505 cents renders as `$5.5` and 5 cents as `$0.5`. It needs `String(abs % 100).padStart(2, "0")`.

## Lower severity / edge cases

- **NaN passes validation (lines 115, 119).** `taxRatePercent` and percent discount `value` are checked with `<` / `>` only. `NaN` fails both comparisons and is accepted, which produces `NaN` totals. Use `Number.isFinite`.
- **Fractional caps and unit counts are unchecked (lines 100-105, 211).** `upTo` and `unitsUsed` need not be integers or non-negative. A non-integer `unitsUsed` produces non-integer cents from `units * unitPriceCents`, which breaks the "integer cents" invariant.
- **`validatePlan` is never called.** `validateAccount` and `buildInvoice` only use `findPlan`, so a malformed plan (unsorted tiers, no tiers) is billed without checks.
- **Rounding is asymmetric for negatives (line 131).** `Math.round` rounds half toward +∞, so -2.5 becomes -2 and 2.5 becomes 3. This affects `percentOf` and `prorate` on credits and refunds.
- **Zero-length period gives NaN (lines 139-143).** If `period.end` equals `period.start`, `used / length` is `NaN`, and `Math.min/max` propagate it.
- **`-0` amounts (line 188).** `-prorate(0, …)` gives `-0` on the credit line. It is harmless in rendering because of the `< 0` check, but it will trip strict-equality checks.
- **Long labels overflow (line 315).** `padEnd(width - amount.length)` does nothing once the label is longer than the width, so the label and amount run together with no space.

## Possible bug (depends on intent)
After an immediate change, `changePlan` sets `account.planId = next.id` (line 183), and `buildInvoice` then charges the full monthly price of the new plan (line 249). The proration lines also add "Remaining time on next". This is correct only if the invoice being built is for the *following* period (billed in advance). If it is for the current period, the new plan is charged for that time twice. The doc comment ("next invoice") suggests the first reading, but the code does not enforce it.
