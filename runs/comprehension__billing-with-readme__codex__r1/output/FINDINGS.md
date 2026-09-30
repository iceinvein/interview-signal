# Findings in `billing.ts`

Line numbers refer to `billing.ts`. The examples below use the rules in `README.md` as the expected behavior.

1. **Line 78 — Unsafe cent amounts pass validation.** `Number.isInteger` accepts integers above `Number.MAX_SAFE_INTEGER`, even though adding one cent to such a value can leave the JavaScript result unchanged. Invoices can therefore lose cents despite the exact integer-cent rule.

2. **Lines 100–105 — Tier caps are not checked as finite whole units.** A fractional or `NaN` `upTo` passes the increasing-cap check. For example, a cap of `1.5` can make `usageCharge` produce a fractional-cent charge, violating the whole-cent rule and the meaning of unit counts.

3. **Lines 115–120 — `NaN` tax rates and percentage discounts pass validation.** Both range checks use only `<` and `>`, which are false for `NaN`. An invoice can consequently contain `NaN` for its discount, tax, or total instead of integer cents.

4. **Line 131 — Percentage rounding can round an exact half cent down.** Binary floating point makes `250 * 64.6 / 100` evaluate just below `161.5`, so `percentOf(250, 64.6)` returns `161` instead of the required `162` cents. This affects both percentage discounts and tax.

5. **Line 146 — Proration rounding can also round an exact half cent down.** For a 70% share, `45 * 0.7` evaluates just below `31.5`, so `prorate(45, 0.7)` returns `31` rather than `32` cents. A 70% share occurs within a 30-day billing month.

6. **Lines 152–155 — Plan-change timing uses included units instead of monthly price.** The rule makes higher-priced plans immediate and lower- or equal-priced plans effective next period. This code can defer a price increase with fewer included units, or immediately apply a cheaper plan with more included units.

7. **Line 182 — Immediate plan changes prorate the used share rather than the unused share.** `prorationFactor` returns time elapsed, but the credit and new-plan charge must cover time remaining. At 25% through a period, a 10,000-cent old plan and 20,000-cent new plan should create a 7,500-cent credit and 15,000-cent charge; this code creates 2,500 and 5,000 cents.

8. **Lines 198–205 — `renew` can return a period that is not a UTC calendar month.** It takes `period.end` as the next start without checking that it is midnight UTC on the first. If the supplied period ends January 15, the returned period runs January 15 to February 1, contrary to the period rule. Invoice construction likewise accepts such periods without validation.

9. **Lines 217–221 — Graduated tier widths use the cumulative cap as the width.** A bounded tier should cover `tier.upTo - previousCap` units. With caps of 100 and 200 followed by an unbounded tier, 250 billable units place 150 units in the second tier and none in the last; the correct allocation is 100, 100, and 50.

10. **Lines 246–251 — Invoice construction never validates the selected plan.** `validatePlan` is exported but not called here or by `changePlan`. A plan with a fractional monthly price or tier rate can be invoiced, producing non-integer-cent amounts despite the money rule.

11. **Lines 251–255 — Usage counts and adjustment amounts are accepted without validation.** Fractional usage, such as `1.5` billable units at one cent per unit, produces a fractional-cent charge. A caller-supplied adjustment of `0.5` cents is also added directly to the subtotal. Both violate the integer-cent rule.

12. **Line 259 — Tax is calculated before account credit.** The tax base must be the subtotal after both discount and credit. On a 10,000-cent subtotal, 1,000-cent credit, and 10% tax rate, tax should be 900 cents; this code calculates 1,000 cents.

13. **Line 261 — Credit can be spent on tax.** `due` includes tax, but credit may only reduce the discounted subtotal before tax. On a 10,000-cent subtotal with 10,500 cents of credit and 10% tax, only 10,000 cents of credit should be used and the remaining 500 should carry forward. This code applies credit against the tax-inclusive 11,000 cents.

14. **Lines 233–236 and 282 — Previewing an invoice consumes credit.** `buildInvoice` calls `applyCredit`, which mutates `account.creditBalanceCents`, and `previewInvoice` calls `buildInvoice` directly. A preview therefore changes the account, contrary to the preview rule.

15. **Lines 293–295 — Finalising an invoice consumes the same credit twice.** `buildInvoice` has already subtracted the applied credit; `finaliseInvoice` subtracts `invoice.creditAppliedCents` again. This can incorrectly exhaust credit or make the balance negative.

16. **Line 304 — Rendered money omits zero padding for cents.** `formatMoney(105)` returns `$1.5` instead of `$1.05`, and `formatMoney(5)` returns `$0.5` instead of `$0.05`, misrepresenting invoice amounts in the plain-text output.
