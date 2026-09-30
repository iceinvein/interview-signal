# Findings for `billing.ts`

1. **Line 182 — Proration uses elapsed time as unused time.** `prorationFactor` returns 0 at the period start and 1 at its end, but the two lines at 188–192 charge and credit the *remaining* time. A change at the start gets no adjustment; one at the end gets a full month's adjustment. Use `1 - prorationFactor(period, at)`.

2. **Line 217 — Later usage tiers use their absolute cap as their width.** Tier `upTo` values are cumulative, but the code does not subtract `previousCap`. With caps of 10 and 20, 25 billable units allocate 10 units to the first tier and 15 to the second, instead of 10, 10, and 5. Use `tier.upTo - previousCap` for bounded tiers.

3. **Lines 233–235 and 282 — Previewing an invoice consumes account credit.** `previewInvoice` calls `buildInvoice`, which calls the mutating `applyCredit`. A preview with a $5 credit reduces the stored credit by $5 despite the function's explicit promise not to change the account. Repeated previews also change their own results.

4. **Line 294 — Finalising consumes the same credit twice.** `buildInvoice` has already deducted `creditAppliedCents` through `applyCredit`; `finaliseInvoice` deducts it again. An account with 500 cents of credit applied to a 1,000-cent invoice ends at -500 cents instead of zero.

5. **Line 304 — Money formatting omits the second cent digit.** `formatMoney(105)` returns `$1.5`, and `formatMoney(5)` returns `$0.5`; these should be `$1.05` and `$0.05`. Pad `abs % 100` to two digits.

6. **Lines 100–104 — Tier caps are not checked for finite whole units.** A fractional cap, `NaN`, or `Infinity` passes `validatePlan` because the only check is `tier.upTo <= previousCap`. Such tiers can allocate fractional units or produce invalid charges. Require a finite integer cap greater than the previous cap.

7. **Lines 115–120 — `NaN` tax rates and percentage discounts pass validation.** Both range checks use only `<` and `>`, which are false for `NaN`. The resulting invoice tax, discount, and total can become `NaN`. Require finite numeric values before checking the range.

8. **Lines 211–223 — Usage quantities are not validated.** Fractional `unitsUsed` can create fractional-cent charges (for example, 0.5 units at 1 cent per unit), violating the module's integer-cent contract. `NaN` usage is silently omitted from the invoice because `usage > 0` is false. Require a finite, non-negative integer quantity.

9. **Lines 226–230 — A percentage discount can become negative.** For a negative subtotal, `percentOf` returns a negative value, and `Math.min(raw, 0)` preserves it. For example, a -100-cent subtotal with a 10% discount produces `discountCents: -10`, which *increases* the amount due by 10 cents. Clamp the percentage discount to zero when the subtotal is non-positive, as the fixed-discount path already does.

10. **Lines 246–247 — Invoice creation never validates the selected plan.** `validateAccount` only checks that the plan ID exists. A catalogue plan with a negative or fractional monthly price, invalid tiers, or no tiers can still be billed, even though `validatePlan` would reject it. Validate the selected plan before computing charges.

11. **Lines 77–79 — The cent validator accepts integers outside JavaScript's safe range.** `Number.isInteger(2 ** 53)` is true, yet adding one cent to that value cannot be represented accurately. Prices and credits that pass this validator can therefore lose cents during invoice arithmetic. Require safe integers and guard arithmetic totals from exceeding that range.

12. **Lines 255–257 — Caller-supplied adjustment amounts are included without validation.** An adjustment of 0.5 cents produces a fractional subtotal and total, and a `NaN` adjustment poisons the entire invoice. Check that each adjustment amount is a finite, safe integer before summing it.

13. **Lines 285–295 — The same period can be finalised repeatedly.** The module promises one invoice per billing period, but `finaliseInvoice` has no issued-period check or stored invoice. Calling it twice for the same account and period creates a second invoice and can charge the period twice. Track the issued period or make finalisation idempotent.
