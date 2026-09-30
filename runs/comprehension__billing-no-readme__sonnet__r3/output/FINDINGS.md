# Findings: billing.ts

## Bugs

1. **Line 217: tier width uses the cumulative cap, not the tier's width.**
   `upTo` is the cumulative number of billable units the tier runs up to (see the `UsageTier` doc and the `validatePlan` check that caps strictly increase). The code uses `tier.upTo` as if it were the width of the tier. With tiers `[{upTo: 100}, {upTo: 200}, {upTo: null}]` and 250 billable units, tier 2 takes 150 units at its price instead of 100, so the tier 3 price never applies to the excess. `previousCap` is tracked (line 221) but never read. The width should be `tier.upTo - previousCap`.

2. **Lines 233-236, 261 and 294: credit is consumed twice in `finaliseInvoice`.**
   `buildInvoice` calls `applyCredit`, which already subtracts the applied credit from `account.creditBalanceCents`. `finaliseInvoice` then subtracts `invoice.creditAppliedCents` again (line 294). A customer with $50 credit and a $30 invoice ends with -$10, not $20.

3. **Lines 233-236 and 261: `previewInvoice` mutates the account.**
   Its doc comment says "without changing the account", but it goes through `buildInvoice` and `applyCredit`, so every preview burns the credit. Credit application should be computed without mutation in `buildInvoice`, and `finaliseInvoice` should be the only place that deducts it. That also fixes #2.

4. **Lines 182-193: proration uses the used share where the unused share is needed.**
   `prorationFactor` returns the share of the period already used, but the result is stored in a variable named `unused`. It is then used to credit "Unused time" on the old plan and to charge "Remaining time" on the new plan. Both should use `1 - factor`. A change made near the start of the period currently credits almost nothing and charges almost nothing.

5. **Line 304: `formatMoney` doesn't zero-pad cents.**
   `abs % 100` is printed as-is, so 5 cents renders as `$0.5`, 105 as `$1.5` and 1000 as `$10.0`. It needs `String(abs % 100).padStart(2, "0")`.

## Likely bugs (depend on intended flow)

6. **Lines 183 and 249: an immediate plan change likely double-charges.**
   `changePlan` sets `account.planId` to the new plan, and `buildInvoice` then bills that plan's full `monthlyPriceCents` for the whole period. On top of that it adds the proration lines (credit for the old plan's unused time, charge for the new plan's remaining time). The customer pays the full new price plus the remaining-time charge, and receives credit for old-plan time that was never billed. Either the base line must be the old plan's price, or the proration lines must be dropped, depending on whether billing is in advance or in arrears.

7. **Lines 152-156: plan change timing is decided only by included units.**
   A plan that has more included units but is cheaper (or a more expensive plan with fewer units) gets the wrong timing. For example, a downgrade in price that adds units goes live immediately and triggers a proration refund. The rule should probably consider price or an explicit upgrade/downgrade notion.

## Minor / robustness

8. **Lines 115 and 119: NaN passes validation.**
   `taxRatePercent`, and a percent discount's `value`, use `<` / `>` comparisons that are false for `NaN`. A `NaN` value passes validation and produces `NaN` totals.

9. **Lines 100-101: tier `upTo` isn't checked to be an integer.**
   `validatePlan` does not check that `upTo` is an integer, or that `includedUnits` and `unitsUsed` are. Fractional caps are accepted silently.

10. **Lines 130-131 and 145-146: `Math.round` rounds negative half-cents toward +infinity.**
    For negative amounts, such as the proration credit or a negative subtotal, this is inconsistent with positive amounts (-2.5 becomes -2, 2.5 becomes 3).

11. **Lines 139-143: `prorationFactor` returns `NaN` for an empty period.**
    If `end` equals `start`, the length is 0 and the result is `0/0`. `Math.min`/`Math.max` propagate `NaN`.

12. **Lines 313-316: `renderInvoice` misaligns long labels.**
    `padEnd` never truncates, so a label longer than `width - amount.length` pushes the amount out of alignment.
