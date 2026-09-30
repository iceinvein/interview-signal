# Findings in `billing.ts`

1. **Lines 77–79, 135, 219, 259: cents can lose precision.** `isWholeCents` accepts integers outside JavaScript's safe integer range, and even safe inputs can exceed that range when charges are added or multiplied. For example, a subtotal of `Number.MAX_SAFE_INTEGER` plus a 2-cent charge is represented as `9007199254740992` rather than `9007199254740993`. Invoices can silently lose cents.

2. **Lines 100–104: usage tier caps need integer and finite validation.** The code checks only whether a cap exceeds the preceding cap. `1.5`, `NaN`, and `Infinity` can pass, although caps represent unit counts. An infinite cap also makes later tiers unreachable.

3. **Lines 115–120: `NaN` tax and percentage discounts pass validation.** Comparisons with `NaN` are false, so both range checks accept it. `NaN` tax propagates into invoice amounts; a `NaN` discount also produces invalid totals.

4. **Lines 182–193: immediate plan changes prorate the elapsed share instead of the remaining share.** `prorationFactor` explicitly returns the share already used, but `changePlan` calls it `unused` and applies it to the old-plan credit and new-plan charge. A change at the period start produces zero adjustments; a change at the period end produces full-month adjustments. The amounts should follow `1 - prorationFactor(period, at)`.

5. **Lines 217–221: bounded usage tiers use cumulative caps as tier widths.** `upTo` is a cumulative billable-unit limit, so each bounded tier's width is `upTo - previousCap`. With caps of 10 and 20, prices of 100, 50, and 10 cents, and 25 billable units, the function charges 1,750 cents instead of 1,550 cents because it puts 15 units in the second tier.

6. **Lines 226–230: a percentage discount on a negative subtotal becomes negative.** The result is capped above by zero but never floored at zero. A 10% discount on a `-100` cent subtotal returns `-10` cents, so the supposed discount increases the amount due by 10 cents.

7. **Lines 246–250: invoice generation never validates the selected plan.** `validateAccount` checks only that the plan ID exists; nothing calls `validatePlan` before using its prices and tiers. A plan with a `-100` cent monthly price passes into `finaliseInvoice` and creates a negative subscription line despite being invalid under `validatePlan`.

8. **Lines 251–255: invoice inputs are not checked for valid units or cent amounts.** `NaN` usage is silently omitted because `usage > 0` is false; infinite usage can produce non-finite invoice amounts. A fractional adjustment such as `0.5` cents is accepted and yields a fractional subtotal and total, contrary to the module's integer-cent contract.

9. **Lines 261–282: previewing an invoice consumes account credit.** `previewInvoice` calls `buildInvoice`, which calls the mutating `applyCredit`. A preview of a 1,000-cent charge with 500 cents of credit leaves the account with zero credit, contradicting the preview's promise not to change the account. A later finalisation then charges 1,000 cents instead of 500.

10. **Lines 293–295: finalising an invoice deducts applied credit twice.** `buildInvoice` already subtracts the credit in `applyCredit`; `finaliseInvoice` subtracts `invoice.creditAppliedCents` again. Starting with 500 cents of credit and applying all of it leaves a `-500` cent balance, which fails `validateAccount` on the next billing operation.

11. **Lines 301–305: `formatMoney` omits the leading zero in cents.** The remainder is interpolated without two-digit padding, so `formatMoney(5)` returns `$0.5` instead of `$0.05` (and negative small amounts have the same problem).
