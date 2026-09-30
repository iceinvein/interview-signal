# Findings in `billing.ts`

| Line | Bug and consequence |
| --- | --- |
| 100–104 | `validatePlan` accepts fractional or `NaN` tier caps because it only compares each cap with the previous one. A fractional cap can produce a fractional-cent usage charge. For example, a 1.5-unit first tier at 1 cent and a following tier at 2 cents charges 2.5 cents for two units, violating the integer-cent rule. |
| 115–120 | `validateAccount` accepts `NaN` for either the tax rate or a percentage discount: both range comparisons are false for `NaN`. The resulting invoice has `NaN` monetary amounts instead of integer cents. |
| 131 | Binary floating-point arithmetic can round an exact half cent down. For example, 64.6% of 250 cents is exactly 161.5 cents and must round to 162, but `percentOf(250, 64.6)` returns 161. |
| 155 | Plan-change timing uses included units instead of monthly price. It can apply a cheaper plan immediately or delay a more expensive plan, contrary to the price-based timing rule. |
| 182 | `prorationFactor` is the **used** share of the month, but the change lines use it as the **unused** share. An upgrade at the start of a period produces zero credit and zero new-plan charge; at the end it prorates the full month. |
| 211–219 | `usageCharge` does not ensure the resulting charge is whole cents. For example, 1.5 billable units at 1 cent per unit produces 1.5 cents, which can flow into an invoice unchanged. |
| 217 | A bounded tier's `upTo` is a cumulative cap, but the code treats it as that tier's width. With caps of 100 and 200 and 250 billable units, it assigns 150 units to the second tier and none to the third; the correct split is 100, 100, and 50. |
| 226–230 | A percentage discount on a negative subtotal becomes a negative discount. For example, `discountAmount(-500, { code: "X", kind: "percent", value: 10 })` returns -50, which increases the amount due instead of discounting it. Negative adjustment lines can produce this subtotal. |
| 246–251 | Invoice construction never calls `validatePlan`. A catalogue entry with no usage tiers passes `validateAccount`, so usage beyond its included allowance is invoiced at zero instead of being rejected or priced. |
| 259–261 | Tax is calculated before credit, and credit is then applied to the tax-inclusive amount. The rules require credit to reduce the post-discount subtotal before tax. On a 1,000-cent subtotal with 500 cents of credit and 10% tax, the code bills 600 cents rather than 550. |
| 235, 282 | `buildInvoice` consumes account credit through `applyCredit`, so `previewInvoice` changes the account even though a preview must leave it untouched. |
| 293–295 | `finaliseInvoice` subtracts applied credit again after `buildInvoice` has already subtracted it. A 500-cent credit used on an invoice reduces the account balance by 1,000 cents and can make it negative. |
| 304 | `formatMoney` does not pad the cent part to two digits. For example, 105 cents renders as `$1.5` instead of `$1.05`. |
