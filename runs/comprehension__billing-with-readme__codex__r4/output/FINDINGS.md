# Findings in `billing.ts`

1. **Line 155 — Plan changes use the wrong criterion.** The code makes a change immediate when the new plan includes more units. The README requires an immediate change only when the new plan's **monthly price** is higher. An upgrade with the same or fewer included units is wrongly delayed, while a cheaper plan with more included units is wrongly applied immediately.

2. **Line 182 — Proration uses elapsed time instead of unused time.** `prorationFactor` returns the share already used, but both lines at 188 and 192 must cover the unused share. For a change one quarter into a period, the code credits and charges one quarter of each price instead of three quarters.

3. **Line 217 — Graduated tier widths are calculated from zero for every tier.** A bounded tier's width is `tier.upTo - previousCap`, not `tier.upTo`. With caps of 10 and 20 and 25 billable units, the code charges 10 units in tier one and 15 in tier two; it should charge 10 in each and 5 in tier three.

4. **Line 259 — Tax is calculated before account credit is deducted.** The README taxes the amount left after both discount and credit. On a 1,000-cent subtotal with no discount, 1,000 cents of credit and 10% tax, tax should be zero; the code charges 100 cents.

5. **Line 261 — Credit can be applied to tax.** `applyCredit` receives `due`, which already includes tax, rather than the subtotal after discount. With a 1,000-cent subtotal, 10% tax and 1,100 cents of credit, the code consumes all 1,100 cents. The README allows only 1,000 cents to be applied before tax, leaving 100 cents to carry forward.

6. **Line 282 (via line 235) — Previewing an invoice consumes account credit.** `previewInvoice` calls `buildInvoice`, which calls `applyCredit` and decrements `account.creditBalanceCents`. The README says preview must leave the account unchanged.

7. **Line 294 — Finalising consumes the same credit twice.** `buildInvoice` has already decremented the balance through `applyCredit`; `finaliseInvoice` subtracts `invoice.creditAppliedCents` again. A 500-cent credit used on a final invoice leaves the balance at -500 cents rather than zero.

8. **Line 304 — Money is rendered without a two-digit cents field.** `formatMoney(1)` returns `$0.1` instead of `$0.01`, and `formatMoney(105)` returns `$1.5` instead of `$1.05`. This misrepresents the integer-cent amounts in the plain-text invoice.

9. **Lines 100–104 — Tier cap validation accepts invalid numbers.** A bounded `upTo` of `NaN` passes `tier.upTo <= previousCap`, although it is not a running total of units. `usageCharge` then produces `NaN`, violating the integer-cent rule. Fractional caps are also accepted despite tiers counting units.

10. **Lines 115–120 — Percentage validation accepts `NaN`.** Both range checks are false for `NaN`, so a `NaN` tax rate or percentage discount passes `validateAccount` and yields `NaN` invoice amounts, violating the integer-cent rule.

11. **Line 212 — Fractional usage can produce fractional cents.** `usageCharge` never checks that `unitsUsed` is a whole unit or rounds the resulting charge. With 1.5 billable units at 1 cent per unit, it returns 1.5 cents, contrary to the README's requirement that every amount be an integer number of cents.

12. **Line 247 — Invoice construction never validates the selected plan.** `buildInvoice` calls `validateAccount`, but that function only checks whether the plan ID exists; it does not call `validatePlan`. A catalogue plan with a fractional monthly price or tier price therefore produces fractional-cent invoice lines even though `validatePlan` would reject it. `changePlan` likewise uses catalogue plans without validating them (lines 170–171).
