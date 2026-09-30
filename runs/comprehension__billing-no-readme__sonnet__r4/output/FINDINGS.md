# Review of `billing.ts`

## Definite bugs

1. **Line 217: tier width is the cumulative cap, not the tier's width.** `UsageTier.upTo` is the cumulative billable-unit ceiling (see `validatePlan`, which requires caps to strictly increase). `usageCharge` uses `tier.upTo` as the width, so each tier after the first is over-allocated. With tiers `[{upTo:100, 5}, {upTo:200, 3}, {upTo:null, 1}]` and 150 billable units, the code bills 100 at 5 and 50 at 3. That happens to be right, but at 250 units it bills 100, then 150 at 3 (the second tier's `Math.min(150, 200)`), then 0 at 1. The second tier should cover only 100 units, and the third should cover 50. The width should be `tier.upTo - previousCap`. `previousCap` is tracked on line 221 but never read, which is the tell.

2. **Lines 233-237, 261, 293-294: credit is deducted twice on finalise, and preview mutates the account.** `buildInvoice` calls `applyCredit`, which decrements `account.creditBalanceCents` (line 235). `previewInvoice` therefore changes the account, despite its doc comment ("without changing the account"). `finaliseInvoice` then subtracts `creditAppliedCents` again on line 294, so the customer loses twice the credit they used. `applyCredit` should compute the amount without mutating, and only `finaliseInvoice` should deduct it.

3. **Lines 182-193: proration uses the wrong fraction.** `prorationFactor` returns the share of the period already used. The variable is named `unused` and passed to both lines. The refund for the old plan and the charge for the new plan should both use the remaining share, `1 - used`. As written, a change on day 1 credits about 0 and charges about 0, and a change at period end credits and charges the full monthly price. The result is only correct at mid-period.

4. **Line 304: cents are not zero-padded.** `abs % 100` is not padded, so 5 cents renders as `$0.5`, and `$12.05` renders as `$12.5`. It needs `String(abs % 100).padStart(2, "0")`.

## Likely bugs / questionable behaviour

5. **Lines 152-156: plan change timing looks only at included units.** A move to a plan with more included units is applied immediately, whatever the price. A move to a more expensive plan with the same or fewer included units is deferred to renewal. A cheaper plan with more units is also applied immediately, which produces a credit. If the intent is "upgrades are immediate", this should compare price, or price and units. Confirm the intent.

6. **Lines 226-231: `discountAmount` can return a negative discount.** `Math.min(raw, Math.max(0, subtotal))` clamps only the upper bound. If `subtotal` is negative (adjustments exceed charges), a percent discount gives a negative `raw`, and a negative discount is returned, which increases the invoice. It should be `Math.max(0, Math.min(raw, subtotal))`.

7. **Line 259: tax is computed on a possibly negative base.** If `subtotal - discount` is negative, tax is negative and `due` is negative. `totalCents` (`due - credit`) can then be a negative amount due with no defined handling.

## Validation gaps

8. **Lines 115, 119: `NaN` passes the range checks.** `NaN < 0 || NaN > 100` is false, so a `NaN` tax rate or percent discount is accepted and poisons every amount.

9. **Lines 100-105: tier caps are not checked to be integers.** A fractional `upTo` passes validation. `includedUnits` is checked, but `upTo` is not.

10. **Lines 246 and 81-107: `validatePlan` is never called.** `buildInvoice` calls `validateAccount`, which only checks that the plans exist. An invalid plan, such as one with negative or fractional prices or unordered tiers, is used without checks.

11. **Lines 139-143: `prorationFactor` returns `NaN` for an empty period.** When `end == start`, `length` is 0 and `used / length` is `NaN`. `Math.min` and `Math.max` propagate `NaN`, so the factor is `NaN` rather than being clamped.

## Minor / presentation

12. **Lines 313-316: a long label runs into its amount.** If `label.length >= width - amount.length`, `padEnd` adds nothing and the label and amount join with no space.
