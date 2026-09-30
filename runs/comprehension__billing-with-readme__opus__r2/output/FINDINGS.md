# Findings: `billing.ts` vs `README.md` billing rules

Ordered roughly by financial impact.

## 1. Preview consumes credit (lines 233–237, 261, 282) — Rule 7
`buildInvoice` calls `applyCredit`, which does `account.creditBalanceCents -= applied`.
`previewInvoice` calls `buildInvoice` directly, so previewing an invoice spends the
customer's credit. Rule 7 says a preview must not change the account.

## 2. Finalising deducts credit twice (line 294) — Rule 7
`buildInvoice` has already taken the credit off the balance (via `applyCredit`), and then
`finaliseInvoice` subtracts `invoice.creditAppliedCents` again. With 1,000¢ of credit on a
600¢ invoice, the balance goes to 400¢ in `buildInvoice` and then to -200¢. Credit is
lost, and the balance can go negative even though `validateAccount` rejects negative credit.
Credit should be worked out without side effects, and the balance should be reduced
exactly once, in `finaliseInvoice`.

## 3. Tax is charged before credit is taken off (line 259) — Rule 8
`tax = percentOf(subtotal - discount, taxRate)` ignores credit. Rule 8 says tax is charged
on the amount left after the discount **and the credit**.

## 4. Credit is applied after tax (lines 260–261) — Rule 7
Credit is applied to `due = subtotal - discount + tax`, so it also pays off tax. Rule 7
says credit goes on the post-discount subtotal, before tax. The order should be:
`base = subtotal - discount` → `credit = min(balance, max(0, base))` →
`tax = percentOf(base - credit, rate)` → `total = base - credit + tax`.
Example: subtotal 10,000¢, no discount, 2,000¢ credit, 10% tax. The code gives
tax 1,000¢, total 9,000¢. The rules give tax 800¢, total 8,800¢.

## 5. Proration uses the *used* share as the *unused* share (lines 182, 188, 192) — Rule 5
`prorationFactor` returns how much of the period has **already passed** (0 at the start,
1 at the end, per its doc comment on line 138). `changePlan` stores this in a variable
named `unused` and uses it for both the credit and the charge. An upgrade on day 1 gives
almost no proration, and an upgrade on the last day credits and charges almost the whole
month. The share should be `1 - prorationFactor(period, at)`.

## 6. Upgrade/downgrade is decided by included units, not price (line 155) — Rule 5
`planChangeTiming` treats a change as immediate when `next.includedUnits >
current.includedUnits`. Rule 5 bases the decision on the **monthly price**: a higher price
means immediate, and a lower or equal price means the start of the next period. Wrong cases:
- a pricier plan with the same or fewer included units gets deferred, and
- a cheaper plan with more included units takes effect immediately and gives prorated
  credit.

It should be `next.monthlyPriceCents > current.monthlyPriceCents`.

## 7. Usage tiers treat `upTo` as a tier width, not a running total (line 217) — Rule 4
`tierWidth = tier.upTo` uses the cap itself as the size of each tier. Rule 4 and the
`UsageTier` doc comment say `upTo` is a running total of billable units. The width must be
`tier.upTo - previousCap`. `previousCap` is tracked on line 221 but never read.
Example: tiers `[{upTo:100, 10¢}, {upTo:200, 5¢}, {upTo:null, 1¢}]` with 250 billable
units. The code charges 100×10 + 150×5 = 1,750¢. The correct charge is
100×10 + 100×5 + 50×1 = 1,550¢.

## 8. Percentages are not rounded correctly for fractional rates (line 131) — Rule 1
`Math.round((amountCents * percent) / 100)` uses floating point, so values that should be
exactly .5 come out just below it and round down. Checked in Node:
`percentOf(750, 8.2)` computes `61.49999999999999` and returns 61, but the exact value is
61.5 and should round up to 62. The same happens for `percentOf(1500, 2.3)` and
`percentOf(1750, 8.2)`. This affects tax and percentage discounts whenever the rate is not
a whole number. Also, for negative amounts (possible when proration adjustments push the
subtotal below zero), `Math.round` sends halves toward +∞ (`-2.5 → -2`), which does not
match "halves rounding up" in magnitude.

## 9. Money formatting drops the leading zero on cents (line 304)
`${abs % 100}` is not zero-padded, so 105¢ renders as `$1.5` instead of `$1.05`, and 100¢
as `$1.0`. Every rendered invoice amount with fewer than 10 cents is wrong.
Use `String(abs % 100).padStart(2, "0")`.

## 10. Plans are never validated (line 246)
`buildInvoice` and `changePlan` call `validateAccount` (or nothing at all) but never
`validatePlan`. Malformed tiers, such as non-increasing caps, a missing unbounded last tier
or fractional prices, go straight into `usageCharge`. If the last tier is bounded, units
beyond it are silently not billed, which breaks Rule 4. This is lower severity because it
depends on bad catalogue data.
