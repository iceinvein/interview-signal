# Findings: billing.ts

Bugs are ordered by severity. Line numbers refer to the current file.

## Definite bugs

1. **Usage tiers treat a cumulative cap as a tier width (lines 217-218, 221).**
   `UsageTier.upTo` is the cumulative cap on billable units (see the doc comment at line 12, and `validatePlan` requiring strictly increasing caps). `usageCharge` uses `tier.upTo` as the width of the tier, so every bounded tier after the first is too wide. With tiers `[{upTo:100, p1}, {upTo:500, p2}, {upTo:null, p3}]` and 300 billable units, it bills 100 at p1 and 200 at p2. That is correct only by accident. With 600 units it bills 100, 500, then 0, when it should bill 100, 400, 100. `previousCap` is tracked at line 221 but never used. The width should be `tier.upTo - previousCap`.

2. **`previewInvoice` mutates the account (lines 233-237, called at 261).**
   `buildInvoice` calls `applyCredit`, which decrements `account.creditBalanceCents`. `previewInvoice` goes through `buildInvoice`, so a preview consumes credit. This contradicts the doc comment at line 274 ("without changing the account"). Calling it twice shows a smaller credit the second time.

3. **`finaliseInvoice` deducts credit twice (lines 261 and 294).**
   `buildInvoice` has already deducted `credit` from the balance. Line 294 subtracts `creditAppliedCents` again. The customer loses twice the credit used, and the balance can go negative. Fix for 2 and 3: make `buildInvoice` compute the credit without mutating, and deduct it only in `finaliseInvoice`.

4. **Plan-change proration uses the used share as the unused share (lines 182, 188, 192).**
   `prorationFactor` returns the share of the period already used. The variable is named `unused` and passed to `prorate` for both lines. The refund for the old plan should be `1 - used` of its price, and the charge for the new plan should also be `1 - used`. As written, a change late in the period refunds and charges almost the full month, and a change early in the period refunds and charges almost nothing.

5. **`formatMoney` doesn't zero-pad cents (line 304).**
   `abs % 100` is printed raw. 105 cents renders as `$1.5` instead of `$1.05`, and 0 cents renders as `$0.0`. Use `String(abs % 100).padStart(2, "0")`. Every invoice line and total is affected.

## Edge-case bugs

6. **Percent discount on a negative subtotal is negative (lines 228-230).**
   Proration adjustments can push the subtotal below zero. `percentOf` then returns a negative amount, and `Math.min(raw, Math.max(0, subtotal))` keeps it, since a negative is below 0. The result is a negative discount that increases the invoice. Clamp the raw value to `>= 0` as well. Tax on a negative base (line 259) is likewise negative, so the invoice total can be negative.

7. **Asymmetric rounding of negative amounts (lines 131, 146).**
   `Math.round` rounds halves toward +infinity, so `Math.round(-2.5)` is `-2` but `Math.round(2.5)` is `3`. Percent amounts on negative bases, such as a discount or tax on a credit-heavy subtotal, round differently from the same positive amount. Round on the absolute value and reapply the sign.

8. **`prorationFactor` returns NaN for an empty period (lines 140-142).**
   If `end == start`, `length` is 0 and `used / length` is NaN or Infinity. `Math.min` and `Math.max` propagate NaN, so the charge becomes NaN. Guard for `length <= 0`.

9. **Validation lets NaN through (lines 115, 119).**
   The range checks use `<` and `>`, which are false for NaN. A NaN `taxRatePercent` or percent discount passes `validateAccount` and then produces NaN money. Use `Number.isFinite` checks. Also, `validatePlan` is never called from `buildInvoice` or `validateAccount`, so invalid plans, such as fractional tier prices, are never caught on the billing path.

## Questionable behaviour (design, not clearly wrong)

10. **`planChangeTiming` looks only at included units (line 155).**
    A higher-priced plan with the same or fewer included units, such as a plan that only adds features, is treated as a period-end change. A cheaper plan with more included units is applied immediately, and `changePlan` then charges the customer for the new plan. Confirm this is intended. It may need to compare price instead.
