# Findings for `billing.ts`

1. **Line 155 — Plan changes are timed by included units instead of price.** The rule makes a higher monthly price effective immediately and a lower or equal price effective at the next period. A more expensive plan with the same allowance is incorrectly deferred; a cheaper plan with a larger allowance is incorrectly applied immediately.

2. **Line 182 — Proration uses the elapsed share of the month.** `prorationFactor` returns the share already used, but both proration lines must use the *unused* share (`1 - prorationFactor(...)`). An upgrade at the period start currently produces zero credit and charge, while one at the end produces full amounts.

3. **Line 217 — Later usage tiers are too wide.** `upTo` is a cumulative billable-unit cap, so a bounded tier's width is `tier.upTo - previousCap`. The code uses the entire cap for every tier. With caps of 10 and 20 and 25 billable units, it charges 10 units in tier one and 15 in tier two instead of 10 in each bounded tier and 5 in the final tier.

4. **Lines 259–261 — Credit is applied after tax instead of before it.** Tax is calculated on `subtotal - discount`, then credit is taken from the tax-inclusive total. The rules require credit to reduce the discounted subtotal first, with tax calculated only on the remainder. For a 1,000-cent subtotal, 500-cent credit, and 10% tax, this code charges 100 cents of tax instead of 50; it can also consume credit to pay tax rather than carrying the unused credit forward.

5. **Lines 233–235 and 282 — Previewing an invoice consumes account credit.** `previewInvoice` calls `buildInvoice`, which calls `applyCredit`; that function immediately subtracts the applied amount from `account.creditBalanceCents`. A preview must leave the account unchanged.

6. **Line 294 — Finalising an invoice consumes credit twice.** `buildInvoice` already subtracts the applied credit in `applyCredit`, and `finaliseInvoice` subtracts the same amount again. For a 1,000-cent balance and 300 cents applied, the balance becomes 400 cents instead of 700.

7. **Line 304 — Money formatting omits the leading zero in the cents field.** `formatMoney(105)` returns `$1.5` instead of `$1.05`, and `formatMoney(5)` returns `$0.5` instead of `$0.05`.

8. **Lines 246–249 — Invoice construction never validates the selected plan.** `validateAccount` checks that the plan exists but does not call `validatePlan`. A catalogue entry with a fractional monthly price or unit price can therefore produce invoice amounts that are not integer cents, contrary to the money rule.

9. **Lines 100–104 — Tier-cap validation accepts fractional and non-finite caps.** The comparison only checks that a cap is greater than the previous one; it never checks that it is a finite integer. A cap of 1.5 passes validation and can split whole units across tiers, producing fractional-cent usage charges. `NaN` also passes because comparisons with it are false.

10. **Lines 115–120 — Invalid `NaN` percentages pass account validation.** Both tax and percentage-discount checks use only `<` and `>`, which are false for `NaN`. Such an account passes validation and yields `NaN` monetary amounts instead of integer cents.

11. **Lines 211–219 — Fractional usage can produce fractional-cent charges.** `unitsUsed` is accepted as any number, and the resulting fractional billable units are multiplied directly by cent prices. For a one-cent tier and 1.5 billable units, `usageCharge` returns 1.5 cents, violating the integer-cent rule.

12. **Lines 244–257 — Adjustment amounts are added without checking that they are integer cents.** A caller can pass an adjustment of 0.5 cents, which is copied into the invoice and subtotal unchanged. This violates the money rule even when the plan and usage are valid.

13. **Lines 139–143 and 203–205 — Billing periods are used without enforcing the calendar-month rule.** A period with an arbitrary start or end is accepted; invoices can cover a non-month interval, and `renew` then starts the next period at that arbitrary end. A zero-length period also makes proration return `NaN`. The API needs to reject periods that do not run from 00:00 UTC on the first to 00:00 UTC on the first of the next month.
