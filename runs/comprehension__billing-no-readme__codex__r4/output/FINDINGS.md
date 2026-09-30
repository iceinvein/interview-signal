# Findings in `billing.ts`

1. **Preview changes the account (`billing.ts:282`, via `billing.ts:233-236`).** `previewInvoice` calls `buildInvoice`, which calls `applyCredit` and subtracts the applied credit from `account.creditBalanceCents`. A preview with a $5 credit leaves the account with $0 credit, contradicting its documented promise not to change the account and changing any later invoice.

2. **Finalization deducts credit twice (`billing.ts:293-294`).** `buildInvoice` already deducts the applied credit in `applyCredit`; `finaliseInvoice` subtracts the same amount again. With a $5 credit and a $10 charge, the returned total is $5 but the stored credit becomes negative $5, making the account invalid for its next invoice.

3. **Later usage tiers have the wrong width (`billing.ts:217`).** `tier.upTo` is a cumulative cap, but the code uses it as the width of each tier. `previousCap` is tracked but never subtracted. For 250 billable units with caps of 100 and 200 and prices of 1, 2, and 3 cents, the function returns 400 cents instead of 450 cents.

4. **Plan-change proration uses elapsed time as remaining time (`billing.ts:182`).** `prorationFactor` explicitly returns the share already used. Both the unused-time credit and remaining-time charge use that share. A change one quarter into a month bills one quarter of each plan instead of three quarters; a change at the period start gets no adjustment.

5. **The same period can be invoiced repeatedly (`billing.ts:286-295`).** `finaliseInvoice` records no issued period and has no idempotency check. Calling it twice for the same account and period returns two full subscription invoices, contrary to the module's stated one-invoice-per-period behavior.

6. **Invoice creation never validates the plan (`billing.ts:246-247`).** `validateAccount` checks that the plan ID exists, but nothing calls `validatePlan` before the plan's prices, included units, and tiers are billed. For example, a plan with a negative monthly price passes through and yields a negative subscription charge, despite `validatePlan` rejecting it.

7. **Usage input is not checked (`billing.ts:211-212`).** A fractional `unitsUsed` produces fractional cents (for example, 1.5 units at 1 cent per unit gives 1.5 cents), violating the integer-cents contract. `NaN` usage can also propagate to a `NaN` invoice total. Billable units need finite integer validation before calculation.

8. **A percent discount can become negative (`billing.ts:229-230`).** Negative adjustments can make the subtotal negative. `percentOf` then returns a negative number, and `Math.min(raw, 0)` preserves it. A subtotal of -100 cents with a 10% discount produces `discountCents: -10`, so a discount increases the amount due and renders as a positive line.

9. **Tier caps need finite integer validation (`billing.ts:100-104`).** `validatePlan` checks only that a cap is greater than the previous one. It accepts fractional and infinite caps; `NaN` also bypasses the comparison. Such plans violate the unit-count contract and can produce fractional or `NaN` usage charges.

10. **`NaN` tax rates pass validation (`billing.ts:115`).** Both comparisons with `NaN` are false, so `validateAccount` accepts it. Tax and invoice totals then become `NaN`.

11. **`NaN` percent discounts pass validation (`billing.ts:119`).** The same comparison pattern accepts a `NaN` discount value, which propagates through `percentOf` into invoice totals.

12. **Cent values can silently exceed exact integer precision (`billing.ts:77-79`, `billing.ts:135`, `billing.ts:219`).** `Number.isInteger` accepts integers above `Number.MAX_SAFE_INTEGER`, and summing lines or multiplying units by a tier price can exceed that limit even when inputs are safe. JavaScript then drops cents: `2 ** 53 + 1` evaluates to `2 ** 53`. Money inputs and arithmetic results need safe-integer bounds or exact integer arithmetic.

13. **Money formatting omits the second decimal digit (`billing.ts:304`).** The cents remainder is interpolated without zero padding. For example, 105 cents displays as `$1.5` instead of `$1.05`, and -5 cents displays as `-$0.5` instead of `-$0.05`.
