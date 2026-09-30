# Findings in `billing.ts`

1. **Line 182 — The proration share is backwards.** `prorationFactor` returns the fraction of the period already used, but `changePlan` calls it `unused` and charges and credits that share. A change at the period start produces no adjustment; a change at the end produces a full-month adjustment. The lines need the remaining share (`1 - prorationFactor(...)`).

2. **Line 217 — Usage tier widths are calculated from the wrong cap.** `upTo` is a cumulative billable-unit limit, so a bounded tier's width is `tier.upTo - previousCap`. The code uses the full cap each time. With caps of 10 and 20 and prices of 1, 2, and 3 cents, 25 billable units cost 40 cents here instead of 45 cents.

3. **Lines 261 and 282 — Previewing an invoice consumes account credit.** `buildInvoice` calls `applyCredit`, which subtracts from `account.creditBalanceCents`; `previewInvoice` calls that same function despite promising not to change the account. Repeated previews can change both the account and later invoice totals.

4. **Lines 261 and 294 — Finalising an invoice subtracts the credit twice.** `applyCredit` already debits the account inside `buildInvoice`, then `finaliseInvoice` debits `invoice.creditAppliedCents` again. With a 1,000-cent charge and 1,000-cent balance, the invoice reports 1,000 cents applied but leaves a balance of -1,000 cents.

5. **Line 304 — Money formatting omits a leading zero in the cents portion.** The remainder is interpolated without padding, so 1 cent renders as `$0.1` and zero as `$0.0`; both should have exactly two decimal digits.

6. **Lines 100–104 — Tier caps are not checked for finite whole units.** The strict-increase comparison accepts `NaN` and fractional caps, and permits an infinite nonfinal cap. Such plans can produce fractional, `NaN`, or otherwise incorrect usage charges. Each non-null cap needs a finite integer check in addition to ordering.

7. **Lines 246–251 — Invoice generation never validates the selected plan.** `validateAccount` only confirms that the plan ID exists; neither it nor `buildInvoice` calls `validatePlan`. A catalogue entry with a negative price, empty tiers, or invalid tier prices can be invoiced despite the module's plan validator.

8. **Lines 115–120 — `NaN` tax rates and percentage discounts pass validation.** Both range checks use only `<` and `>`, which are false for `NaN`. A `NaN` tax rate makes the tax and total `NaN`; a `NaN` discount can do the same to the discount, tax, and total.

9. **Lines 211–223 — Metered usage is not validated as a nonnegative whole number.** Fractional usage can produce fractional cents, `Infinity` can produce an infinite charge, and `NaN` is silently treated as having no usage line. These violate the stated integer-cent and unit assumptions.

10. **Lines 244–257 — Adjustment amounts are summed without validating cents.** A caller can pass a fractional or nonfinite `amountCents`, and the resulting invoice contains fractional or `NaN` money. Adjustments should be checked before they enter the subtotal.

11. **Lines 226–230 — A percentage discount becomes negative on a negative subtotal.** For a -100-cent subtotal and a 10% discount, `discountAmount` returns -10 cents. Subtracting that "discount" increases the amount due; a discount must be capped at zero as well as at the positive subtotal.

12. **Lines 77–78 — Monetary validation accepts integers beyond JavaScript's safe range.** `Number.isInteger(9_007_199_254_740_992)` is true, but adding one cent to that value has no effect in `number` arithmetic. Plans and credit balances can therefore pass validation while losing cents during billing; the validator should require safe integers and computations should stay within that range.

13. **Lines 285–295 — Finalisation has no one-invoice-per-period guard.** Calling `finaliseInvoice` twice with the same account and period creates two invoices and charges the same subscription twice. Nothing records or checks that the period has already been issued, despite the module's one-invoice-per-period contract.
