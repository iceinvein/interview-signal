# Findings: `billing.ts` vs `README.md` billing rules

Six bugs. The first five break a README rule. The sixth is a display bug.

## 1. Plan change timing uses included units, not monthly price (line 155)
**Rule 5.** `planChangeTiming` returns `"immediate"` when `next.includedUnits > current.includedUnits`. The rule is about monthly price. A higher price takes effect immediately. A lower or equal price waits for the next period.
- A cheaper plan with more included units is applied immediately and prorated. It should be scheduled with no credit.
- A more expensive plan with the same or fewer included units is deferred. It should apply immediately with proration.

The fix is `next.monthlyPriceCents > current.monthlyPriceCents`.

## 2. Proration uses the used share where the unused share is needed (lines 182, 188, 193)
**Rule 5.** `prorationFactor` returns the share of the period already used. Its doc comment says so. `changePlan` stores that value in a variable named `unused` and uses it for both lines.
- The old plan is credited for the elapsed share instead of the remaining share.
- The new plan is charged for the elapsed share instead of the remaining share.

A change on day 1 is prorated at about 0%. A change at the end of the period is prorated at about 100%. The factor should be `1 - prorationFactor(period, at)`.

## 3. Graduated tiers use the running-total cap as the tier width (lines 217-221)
**Rule 4.** Each tier's `upTo` is a running total of billable units. `usageCharge` takes `Math.min(billable, tier.upTo)` as the units in the tier. It should use the width, `tier.upTo - previousCap`.
- `previousCap` is updated on line 221 but never read.
- With tiers `[{upTo: 100, ...}, {upTo: 500, ...}, {upTo: null, ...}]` and 300 billable units, tier 1 takes 100. Tier 2 then takes `min(200, 500)` = 200, which happens to be correct.
- With 700 billable units, tier 1 takes 100 and tier 2 takes `min(600, 500)` = 500, so 600 units are billed in tiers 1 and 2. The correct split is 100 in tier 1 and 400 in tier 2, with 200 left for tier 3.

Tier 2 is overcharged whenever usage passes its cap. The overcharge is larger for later tiers.

## 4. Credit is applied after tax, and tax is charged on the wrong base (lines 259-261)
**Rules 7 and 8.** Credit must come off the post-discount amount before tax, and tax is charged on what remains. The code does this instead:
1. It computes tax on `subtotal - discount`.
2. It adds the tax to get `due`.
3. It applies credit against `due`.

Credit therefore reduces the tax-inclusive amount, and tax is charged on an amount that credit has not reduced. The correct order is:
1. `afterDiscount = subtotal - discount`
2. `credit = min(creditBalance, max(0, afterDiscount))`
3. `tax = percentOf(afterDiscount - credit, rate)`
4. `total = afterDiscount - credit + tax`

## 5. Previewing mutates the account, and finalising consumes credit twice (lines 235, 261, 294)
**Rule 7.** `applyCredit` subtracts from `account.creditBalanceCents` (line 235). `buildInvoice` calls it, so `previewInvoice` changes the account. `finaliseInvoice` then subtracts `creditAppliedCents` again (line 294).
- Preview consumes the credit. This breaks "Previewing an invoice must not change the account."
- Finalising takes the credit a second time. Because `applyCredit` has already lowered the balance, the second subtraction can drive `creditBalanceCents` negative. A single finalise with no preview already takes the credit twice.

`applyCredit` should be a pure computation. Only `finaliseInvoice` should debit the account.

## 6. `formatMoney` does not zero-pad the cents (line 304)
`abs % 100` is printed unpadded. 505 cents renders as `$5.5`, and 5 cents renders as `$0.5`. The cents need `String(abs % 100).padStart(2, "0")`. This affects every amount in `renderInvoice`.

## Lower-confidence issues
- **Negative subtotal (line 230).** If negative adjustments make the subtotal negative, a percent discount is negative. `Math.min(raw, 0)` returns that negative value, so the discount adds to the bill. Rule 6 says the discount never exceeds the subtotal. It should be clamped to `[0, max(0, subtotal)]`.
- **Negative zero (line 188).** `-prorate(...)` yields `-0` when the prorated amount is 0. It can show up as a `-0` line amount. Use `0 - x` or normalise it.
- **Fractional tax rates (line 131).** `percentOf` multiplies by a fractional percent in floating point before rounding, for example 8.25%. Rounding of exact halves (rule 1) can go wrong when the product is not exactly representable. Basis-point integer maths would avoid this.
- **Unvalidated inputs.** `unitsUsed` is not validated in `buildInvoice`. Neither is the period, which rule 2 requires to be a UTC calendar month. `validatePlan` does not require `upTo` to be an integer. `validateAccount` does not reject a NaN tax rate.
