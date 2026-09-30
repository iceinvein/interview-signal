# Findings: `billing.ts` vs `README.md` rules

## Bugs

1. **Line 155 (`planChangeTiming`): upgrade is decided by included units, not price.** (Rule 5)
   It returns `"immediate"` when `next.includedUnits > current.includedUnits`. The rule says a move to a plan with a *higher monthly price* is immediate, and a lower or equal price waits for the next period. Two failures follow:
   - A pricier plan with the same or fewer included units is deferred and never prorated.
   - A cheaper plan with more included units is applied immediately with proration and credit.

   It should compare `next.monthlyPriceCents > current.monthlyPriceCents`.

2. **Lines 182, 188, 193 (`changePlan`): proration uses the used share, not the unused share.** (Rule 5)
   `prorationFactor` returns the share of the period already elapsed (0 at the start, 1 at the end). The variable is named `unused` and used as if it were the unused share. A change on day 1 credits about 0 and charges about 0, instead of crediting and charging nearly the full month. It should use `1 - prorationFactor(...)`.

3. **Lines 217-221 (`usageCharge`): tier width ignores the previous cap.** (Rule 4)
   `tierWidth` is `tier.upTo`, but `upTo` is a running total of billable units. The width should be `tier.upTo - previousCap`. As written, tier 2 (for example `upTo: 300` after `upTo: 100`) is allowed 300 units instead of 200, so units are charged at the wrong rate. `previousCap` is updated but never read, which shows the subtraction was intended.

4. **Lines 259-261 (`buildInvoice`): credit and tax are applied in the wrong order.** (Rules 7 and 8)
   Tax is computed on `subtotal - discount` and added, and only then is credit applied to the tax-inclusive `due`. The rules say credit comes off the discounted subtotal first, and tax is charged on what is left after discount and credit. The result is over-taxed whenever credit is present, and credit can offset tax. It should be `net = max(0, subtotal - discount)`, then `credit = min(balance, net)`, then `tax = percentOf(net - credit, rate)`, then `total = net - credit + tax`.

5. **Line 261 (`buildInvoice` → `applyCredit`, lines 233-237): previewing mutates the account.** (Rule 7)
   `applyCredit` decrements `account.creditBalanceCents`, and `previewInvoice` calls `buildInvoice`. Every preview consumes credit, which the rule forbids.

6. **Lines 261 and 294 (`finaliseInvoice`): credit is deducted twice.** (Rule 7)
   `buildInvoice` already deducts the credit (bug 5), and `finaliseInvoice` then subtracts `creditAppliedCents` again. The balance can go negative, and `validateAccount` then rejects the account on the next invoice. Fix: make `buildInvoice` pure, and have only `finaliseInvoice` deduct the credit.

7. **Line 304 (`formatMoney`): cents are not zero-padded.** (Rule 1 / presentation)
   `abs % 100` is printed as-is, so 105 cents renders as `$1.5` and 100 cents as `$1.0`. It should use `String(abs % 100).padStart(2, "0")`.

## Lower-severity and edge-case issues

8. **Line 230 (`discountAmount`): the discount can go negative when the subtotal is negative.** (Rule 6)
   The subtotal can be negative, because proration credits are unbounded lines. For a percent discount, `raw` is then negative, and `Math.min(raw, 0)` returns that negative value. That produces a negative discount, which increases the total. It should clamp with `Math.max(0, ...)` on the result.

9. **Lines 131 and 146 (`percentOf`, `prorate`): rounding uses floating point.** (Rule 1)
   `amountCents * percent / 100` and `amountCents * share` can land just below an exact half because of float error, so `Math.round` rounds down when the rule says halves round up. This is most likely with fractional percents such as 8.25 and with the `share` from the date ratio. Integer arithmetic (for example, percent in basis points) would be exact. `Math.round` also rounds negative halves toward +∞, which is asymmetric for the negative proration credit on line 188.

10. **Lines 81-107 (`validatePlan`): tier caps are not checked to be integers.** (Rule 4)
    A fractional `upTo` passes validation. Also, `validatePlan` is never called from `buildInvoice` or `changePlan`, so an invalid plan is not caught there.
