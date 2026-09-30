# Findings: `billing.ts` vs `README.md` billing rules

Line numbers refer to `billing.ts`.

## 1. Usage tiers treat `upTo` as a tier width, not a running total (lines 217-221)
**Rule 4.** `tierWidth` is set to `tier.upTo`, but `upTo` is a running total of billable units. The width should be `tier.upTo - previousCap`. `previousCap` is tracked on line 221 and never read.
Example: tiers `[{upTo: 100, $1}, {upTo: 200, $0.50}, {upTo: null, $0.25}]` with 150 billable units. The code charges 100 at $1 and 50 at $0.50, which is correct only by coincidence. With 250 billable units it charges 100 at $1, then 150 at $0.50 (`min(150, 200)`), then 0 at $0.25. The correct split is 100 / 100 / 50.

## 2. Plan-change timing is decided by included units, not price (line 155)
**Rule 5.** A move to a higher monthly price is immediate. A move to a lower or equal price waits for the next period. `planChangeTiming` compares `includedUnits` instead of `monthlyPriceCents`.
Example: a more expensive plan with the same or fewer included units is deferred, and a cheaper plan with more included units takes effect immediately, with proration.

## 3. Proration uses the used share where the unused share is needed (lines 182, 188, 192)
**Rule 5.** `prorationFactor` returns the share already used, from 0 at the start to 1 at the end (line 138 says so). `changePlan` stores it in a variable called `unused` and uses it for both lines. The rule says to credit the unused share of the old plan and charge the same unused share of the new plan. It should use `1 - prorationFactor(period, at)`.
Example: a change on day 1 credits about 0 of the old plan, where it should credit nearly all of it. A change at the end of the period credits the full old price.

## 4. Credit is applied after tax, and tax is charged on the wrong base (lines 259-261, 270)
**Rules 7 and 8.** Credit comes off the amount after discount and before tax, and tax is charged on what is left. The code computes `tax = percentOf(subtotal - discount)` and then `due = subtotal - discount + tax`. It applies credit against `due`, which includes tax. Tax is therefore charged on the pre-credit amount, and credit can absorb tax.
Fix: `net = subtotal - discount; credit = min(balance, max(0, net)); tax = percentOf(net - credit, rate); total = net - credit + tax`.
Example: $100 subtotal, $100 credit, 10% tax. The code bills $10 tax and applies $100 credit against $110, leaving $10 due. The rules give $0 tax and $0 due.

## 5. `previewInvoice` mutates the account, and `finaliseInvoice` consumes credit twice (lines 233-237, 261, 293-294)
**Rule 7.** Previewing must not change the account, and only finalising consumes credit. `buildInvoice` calls `applyCredit` (line 261), which does `account.creditBalanceCents -= applied` (line 235). Both preview and finalise go through it.
- `previewInvoice` reduces the account's credit, which breaks the rule.
- `finaliseInvoice` subtracts `creditAppliedCents` again on line 294, so credit is deducted twice.
Fix: make `applyCredit` a pure calculation, and deduct only in `finaliseInvoice`.

## 6. `formatMoney` does not zero-pad cents (line 304)
`${abs % 100}` gives `$5.5` for both 550 and 505 cents. 505 should be `$5.05`, and 5 cents comes out as `$0.5` instead of `$0.05`. This is wrong for any amount whose cents part is below 10. Use `String(abs % 100).padStart(2, "0")`. This affects every row of `renderInvoice`.

## 7. Percent discount can go negative when the subtotal is negative (lines 228-230)
**Rule 6.** With a negative subtotal, for example when adjustments outweigh the charges, `percentOf` returns a negative `raw`. `Math.min(raw, Math.max(0, subtotal))` then returns the negative `raw`, so the "discount" increases the amount due. The discount should be clamped into `[0, max(0, subtotal)]`.
Lower severity, because the negative subtotal case needs large negative adjustments.

## 8. Percentage arithmetic goes through floating point (line 131)
**Rule 1.** `Math.round((amountCents * percent) / 100)` can land just under a half-cent boundary when `percent` is fractional, such as 8.25 or 7.1. The half then rounds down, where the rule says halves round up. Doing the multiplication in integer basis points, or with an epsilon-safe round, avoids this.
Lower severity and data-dependent. I did not construct a failing case.

## Checked and found consistent with the README
- Period boundaries in `renew` (1st of the month, UTC, exclusive end).
- Subscription charge on the current plan (rule 3).
- Cancelling a pending change by choosing the current plan (rule 5).
- `usageCharge` subtracting included units before pricing.
