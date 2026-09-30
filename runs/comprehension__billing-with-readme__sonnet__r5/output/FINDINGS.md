# Findings: `billing.ts` vs `README.md` billing rules

## 1. Plan change timing uses included units, not price (line 155) — rule 5
`planChangeTiming` returns `"immediate"` when `next.includedUnits > current.includedUnits`. Rule 5 keys on the **monthly price**: a higher price is immediate, and a lower or equal price waits for the next period. Consequences:
- A pricier plan with the same or fewer included units is deferred, so there is no proration and the customer stays on the old plan.
- A cheaper plan with more included units is applied immediately, so the customer gets a mid-period downgrade with a proration credit.

Fix: compare `next.monthlyPriceCents > current.monthlyPriceCents`.

## 2. Proration uses the used share, not the unused share (lines 182, 188, 191) — rule 5
`prorationFactor` returns the share of the period already **used** (0 at the start, 1 at the end). The variable is misleadingly named `unused` and is applied as-is to both lines. The credit for the old plan and the charge for the new plan are therefore based on the elapsed time, not the remaining time. A change on day 1 credits about 0 and charges about 0, and a change at the end credits and charges nearly the full price. Fix: use `1 - prorationFactor(period, at)` for both lines.

## 3. Graduated tiers treat `upTo` as a width, not a running total (lines 217–221) — rule 4
`tierWidth = tier.upTo` is the cumulative cap, but it is used as the number of units in that tier. For tiers `[{upTo: 100}, {upTo: 300}, {upTo: null}]`, the second tier should hold 200 units (300 − 100) but holds up to 300. `previousCap` is tracked and never used, which shows the intended subtraction was left out. Fix: `tier.upTo === null ? billable : tier.upTo - previousCap`.

## 4. Tax is charged before credit, and credit is applied to the taxed amount (lines 259–261) — rules 7 and 8
The code computes `tax = percentOf(subtotal - discount, rate)`, then `due = subtotal - discount + tax`, then applies credit to `due`. Rules 7 and 8 require the order subtotal → discount → credit → tax. Credit must come off the post-discount amount, and tax is charged on what remains (post-discount, post-credit). As written, tax is charged on amounts the credit covers, and the credit is spent on tax. Fix:
```
afterDiscount = subtotal - discount
credit = min(balance, max(0, afterDiscount))
tax = percentOf(afterDiscount - credit, rate)
total = afterDiscount - credit + tax
```

## 5. Previewing an invoice mutates the account (lines 233–237, 261, 282) — rule 7
`buildInvoice` calls `applyCredit`, which does `account.creditBalanceCents -= applied`. `previewInvoice` calls `buildInvoice`, so every preview consumes credit. Rule 7 says a preview must not change the account. `buildInvoice` should compute the credit without mutating.

## 6. Finalising consumes credit twice (lines 237 and 294) — rule 7
`finaliseInvoice` calls `buildInvoice`, which already deducts the credit inside `applyCredit`. Line 294 then deducts `creditAppliedCents` again. The balance drops by twice the credit used and can go negative. Fixing #5 (making `buildInvoice` pure) also fixes this, since line 294 would then be the only deduction.

## 7. `formatMoney` does not pad the cents (line 304) — rule 1 (presentation of integer cents)
`${abs % 100}` prints one digit for values under 10. 505 cents renders as `$5.5` and 500 cents as `$5.0`, and both read as wrong amounts. Fix: `String(abs % 100).padStart(2, "0")`.

## Checked and not flagged
- Rule 2 period handling (`renew`, the UTC month boundaries, the exclusive end) is correct. The "last day" shown in `renderInvoice` is a display convention.
- Rule 3: the subscription line charges the full price of `account.planId` at build time.
- Rule 6: `discountAmount` caps the discount at the subtotal and only applies one discount.
- `percentOf` uses `Math.round`, which rounds halves up for non-negative amounts. With fractional percentages, `amount * percent / 100` is floating point, so an exact half-cent could in theory land just below .5. I did not see a concrete failing case.
