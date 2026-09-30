# Findings: `billing.ts` checked against `README.md`

Findings are in order of severity. Line numbers refer to `billing.ts`.

## 1. Plan change timing is based on included units, not price (Rule 5)
**Line 155.** `planChangeTiming` returns `"immediate"` when
`next.includedUnits > current.includedUnits`. Rule 5 says the timing depends
on the **monthly price**: a move to a higher price takes effect immediately,
and a move to a lower or equal price waits for the next period.
- A cheaper plan with more included units is applied immediately and prorated.
  It should have been scheduled for the next period with no credit.
- A more expensive plan with the same or fewer included units is deferred.
  It should have been applied immediately.

Fix: `next.monthlyPriceCents > current.monthlyPriceCents`.

## 2. Proration uses the used share instead of the unused share (Rule 5)
**Lines 182, 188, 192.** `prorationFactor` returns the share of the period
**already used** (its doc comment says "from 0 at the start to 1 at the end").
The result is stored in a variable called `unused` and used for both the
credit and the charge. Rule 5 requires crediting and charging the **unused**
share. For example, an upgrade on day 2 credits and charges almost nothing,
and an upgrade on the last day credits and charges almost a full month.

Fix: `const unused = 1 - prorationFactor(period, at);`

## 3. Tiers are treated as widths, but `upTo` is a running total (Rule 4)
**Line 217.** `tierWidth` is set to `tier.upTo`. Rule 4 and the `UsageTier`
doc say `upTo` is a **running total** of billable units, so the tier's width
is `tier.upTo - previousCap`. `previousCap` is tracked on line 221 but never
used. Every tier after the first is too wide. Example: tiers `[{upTo:1000},
{upTo:5000}, {upTo:null}]` with 7000 billable units. The second tier bills
5000 units instead of 4000, and the third bills 1000 instead of 2000.

Fix: `const tierWidth = tier.upTo === null ? billable : tier.upTo - previousCap;`

## 4. Tax is calculated before credit is taken off (Rule 8)
**Line 259.** Tax is `percentOf(subtotal - discount, taxRate)`. Rule 8 says
tax is charged on the amount left **after the discount and the credit**.
Accounts with credit are overtaxed.

## 5. Credit is applied after tax instead of before (Rule 7)
**Lines 260–261.** Credit is applied to `due = subtotal - discount + tax`.
Rule 7 says credit is applied to the subtotal after the discount and
**before tax**. So credit also pays down tax, and the cap "never takes that
amount below zero" is checked against the wrong amount.

The correct order is: `afterDiscount = subtotal - discount`, then
`credit = min(balance, max(0, afterDiscount))`, then
`tax = percentOf(afterDiscount - credit, rate)`, then
`total = afterDiscount - credit + tax`.

## 6. `previewInvoice` changes the account's credit balance (Rule 7)
**Lines 235, 261, 282.** `buildInvoice` calls `applyCredit`, and
`applyCredit` subtracts from `account.creditBalanceCents`. `previewInvoice`
calls `buildInvoice` directly, so a preview uses up credit. Rule 7 says
previewing must not change the account. Each preview drains the customer's
credit.

## 7. `finaliseInvoice` takes the credit off twice (Rule 7)
**Line 294.** `buildInvoice` has already subtracted the applied credit
(line 235), and `finaliseInvoice` subtracts `invoice.creditAppliedCents`
again. Finalising consumes twice the credit that appears on the invoice. The
balance can go **negative**, and the next `validateAccount` call then throws
(line 112).

Fix for findings 6 and 7: `applyCredit` should only compute the amount, with
no side effect. `finaliseInvoice` should then be the only place that
subtracts it.

## 8. `formatMoney` does not zero-pad cents
**Line 304.** `abs % 100` is inserted without padding, so 105 cents renders
as `$1.5` instead of `$1.05`, and 100 renders as `$1.0`. Every amount with
cents below 10 shows the wrong value on the rendered invoice.

Fix: `String(abs % 100).padStart(2, "0")`.

## 9. Percentage rounding is not guaranteed to round halves up (Rule 1)
**Lines 131 and 146.** `Math.round((amountCents * percent) / 100)` uses
floating-point numbers. This is exact when `percent` is a whole number. It is
not exact for fractional rates such as 7.3 or 8.25, which `validateAccount`
allows. Those cannot be represented exactly, so a true half-cent can come out
as `x.4999…` and round down. Rule 1 requires halves to round up.

Also, `Math.round` rounds negative halves toward +∞ (`Math.round(-2.5) = -2`).
So if tax is ever calculated on a negative amount, for example when
adjustments make the subtotal negative, the rounding direction is different.

Consider integer or decimal arithmetic. For example, store rates in basis
points and round with integer math.

## 10. Plans are never validated
**Line 246 (and `validatePlan`, line 81).** `buildInvoice` validates the
account but never calls `validatePlan` on the plan it bills. `changePlan`
does not either. A plan with fractional prices or badly ordered tier caps
would silently produce non-integer or wrong amounts. That breaks Rule 1
(integer cents) and Rule 4.

## 11. Some validation checks let `NaN` through
**Lines 115 and 119.** Range checks written as `x < 0 || x > 100` are both
false for `NaN`. A `NaN` tax rate or percent discount therefore passes
validation. Every invoice total then becomes `NaN`, which breaks Rule 1.
