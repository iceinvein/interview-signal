# Findings in `billing.ts`

1. **Line 182 — Proration uses the elapsed share instead of the unused share.** `prorationFactor()` returns 0 at the period start and 1 at the end, but `changePlan()` applies it to both *unused* old-plan time and *remaining* new-plan time. A change at the start produces no adjustment; one at the end produces a full-month adjustment. Use `1 - prorationFactor(period, at)`.

2. **Lines 217–221 — Usage tier caps are treated as tier widths.** `upTo` is a cumulative cap, so a bounded tier's width is `tier.upTo - previousCap`. With caps of 10 and 20 followed by an unbounded tier, 25 billable units are charged as 10 units in the first tier and 15 in the second; the last 5 should be in the third tier. `previousCap` is updated but never used to calculate the width.

3. **Lines 261 and 282 — Previewing an invoice consumes account credit.** `previewInvoice()` calls `buildInvoice()`, which calls the mutating `applyCredit()`. A preview with 500 cents of credit and at least 500 cents due leaves the account's balance at zero, contrary to the preview's documented promise not to change the account.

4. **Lines 261 and 293–295 — Finalising an invoice consumes credit twice.** `buildInvoice()` already deducts `creditAppliedCents`; `finaliseInvoice()` deducts it again. With 500 cents of credit and 1,000 cents due, the resulting balance is −500 cents, although the invoice reports only 500 cents of credit applied.

5. **Lines 100–105 — Tier caps need integer and finite validation.** The strictly-increasing comparison accepts fractional caps and `NaN` (`NaN <= previousCap` is false). Fractional caps can produce fractional-cent charges; a `NaN` cap produces a `NaN` usage charge that `buildInvoice()` silently omits because `NaN > 0` is false.

6. **Lines 115–120 — `NaN` tax rates and percentage discounts pass validation.** Both checks use only `<` and `>`, which are false for `NaN`. Such values then propagate into `taxCents`, `discountCents`, and `totalCents` instead of raising `BillingError`.

7. **Lines 211–223 — Usage quantities are not validated.** A fractional `unitsUsed` can produce a fractional-cent charge; `NaN` can produce a `NaN` charge that is left off the invoice. Usage must be checked as a non-negative integer before it is priced.

8. **Lines 246–251 — Invoice generation never validates the selected plan.** `validateAccount()` checks that the plan ID exists, but does not call `validatePlan()`. As a result, a catalogue entry with a negative monthly price, invalid tier price, or malformed tier caps can still be billed despite the module's plan validator.

9. **Lines 229–230 — A percentage discount can become negative.** When adjustments make the subtotal negative, `percentOf()` returns a negative number and `Math.min(raw, 0)` preserves it. For a −1,000-cent subtotal and a 10% discount, `discountAmount()` returns −100 cents, increasing the amount due by 100 cents. A discount should be bounded below by zero.

10. **Lines 255–257 — Adjustment amounts are added without validating whole cents.** A caller can pass an adjustment of 0.5 cents or `NaN`; the invoice then has a fractional or non-finite subtotal and total despite the stated integer-cents money contract.

11. **Lines 77–79 — Money validation accepts integers outside JavaScript's safe range.** `Number.isInteger()` accepts values above `Number.MAX_SAFE_INTEGER`. Adding or multiplying such cent amounts can silently lose cents, so the validated prices and balances are not safe for the arithmetic in this module.

12. **Line 304 — `formatMoney()` does not pad the cents to two digits.** For example, 5 cents renders as `$0.5` instead of `$0.05`, and 105 cents renders as `$1.5` instead of `$1.05`.

13. **Lines 292–295 — Finalisation does not enforce one invoice per billing period.** Calling `finaliseInvoice()` again with the same account and period issues another invoice; there is no issued-period check or recorded invoice. This breaks the module's stated one-invoice-per-period behavior and can bill the same period twice.

14. **Lines 139–143 and 163–184 — Invalid billing dates can corrupt a plan change.** No check ensures that `period` is a valid UTC calendar month or that `at` is a valid date within it. A zero-length period or invalid `at` makes the proration factor `NaN`; `changePlan()` still changes `account.planId` and returns `NaN`-cent adjustments. An out-of-period `at` is silently clamped and billed as if it happened at a boundary.
