# Findings in `billing.ts`

Line numbers refer to `billing.ts`. Each finding describes a way the module violates a rule in `README.md`.

1. **Line 100–104 — Tier caps are not checked as whole, finite unit counts.** `validatePlan` accepts a fractional cap or `NaN` because its only cap check is `tier.upTo <= previousCap`. A `NaN` cap passes and makes `usageCharge` return `NaN`; a fractional cap can produce fractional cents. This breaks the usage and integer-money rules.

2. **Line 115–120 — `NaN` tax rates and percentage discounts pass validation.** Comparisons with `NaN` are false, so both range checks accept it. `percentOf` then produces `NaN` instead of an integer-cent tax or discount.

3. **Line 152–155 — Plan-change timing uses included units instead of monthly price.** A more expensive plan with the same or fewer included units is incorrectly deferred, while a cheaper plan with more included units is applied immediately. Rule 5 bases timing solely on whether the new monthly price is higher.

4. **Line 182 — Proration uses elapsed time as the unused share.** `prorationFactor` returns 0 at the start and 1 at the end of the period. The credit and charge at lines 188 and 192 therefore do the reverse of rule 5: a change at the start receives no proration, while one at the end receives a full month's proration. The unused share is `1 - prorationFactor(period, at)`.

5. **Line 217 — Graduated tiers reuse each tier's cumulative cap as its width.** A finite tier should cover `tier.upTo - previousCap` units. With caps of 100 and 200 and 350 billable units, the code charges 100 units in tier 1 and 200 in tier 2; the correct split is 100, 100, and 150. This violates rule 4.

6. **Line 211–223 — Fractional usage can create fractional-cent charges.** `unitsUsed` is never checked as a whole unit count. For a plan with no included units and a one-cent rate, `usageCharge(plan, 0.5)` returns `0.5` cents, violating rule 1. The invoice path at line 251 accepts that result.

7. **Line 246–255 — Invoice construction never validates plan prices or adjustment amounts.** `validateAccount` only checks that the plan IDs exist; it does not call `validatePlan`. A plan with a fractional monthly or tier price, or a caller-supplied adjustment of `0.5` cents, can therefore put non-integer amounts on an invoice. This violates rule 1 despite the presence of `validatePlan`.

8. **Line 259 — Tax is computed before account credit is deducted.** For a 1,000-cent subtotal, no discount, 500 cents of credit, and 10% tax, the code charges 100 cents of tax; rule 8 requires tax on the remaining 500 cents, or 50 cents.

9. **Line 260–261 — Credit can be spent on tax.** `due` includes tax before `applyCredit` caps the applied credit. With a 1,000-cent subtotal, 10% tax, and 1,100 cents of credit, the code consumes all 1,100 cents. Rule 7 permits only 1,000 cents to be applied to the post-discount subtotal, leaving 100 cents to carry forward. This is separate from the incorrect tax base at line 259.

10. **Line 282 (via lines 233–235) — Previewing consumes account credit.** `previewInvoice` calls `buildInvoice`, which calls `applyCredit` and subtracts from `account.creditBalanceCents`. Rule 7 says a preview must leave the account unchanged. Repeated previews can therefore show different totals.

11. **Line 293–294 — Finalising consumes the same credit twice.** `buildInvoice` already subtracts the applied credit at line 235; `finaliseInvoice` subtracts it again. A 500-cent credit applied to an invoice reduces the account balance by 1,000 cents and can make it negative, contrary to rule 7.

12. **Line 304 — Monetary output omits the second cent digit.** `formatMoney(1)` returns `$0.1`, which reads as ten cents, instead of `$0.01`. Every amount whose cent part is 0–9 is rendered incorrectly in `renderInvoice`.
