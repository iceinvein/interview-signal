# billing.ts review findings

Reviewed against the billing rules in `README.md`. Line numbers refer to `billing.ts`.

## 1. Plan-change timing compares included units, not price (rule 5)

**Line 155.** `planChangeTiming` decides "immediate" vs "period-end" with
`next.includedUnits > current.includedUnits`. Rule 5 says a move to a plan with a
**higher monthly price** is immediate, and a move to a plan with a lower or equal
price waits for the next period.

- A pricier plan with the same or fewer included units is wrongly deferred, with no
  proration.
- A cheaper plan with more included units is wrongly applied at once and prorated.

Fix: `next.monthlyPriceCents > current.monthlyPriceCents ? "immediate" : "period-end"`.

## 2. Proration uses the used share instead of the unused share (rule 5)

**Line 182, used on lines 188 and 192.** `prorationFactor` returns the share of the
period **already used** (0 at the start, 1 at the end; see its doc comment on line 138).
`changePlan` stores that value in `unused` and uses it for both the credit and the
charge. Rule 5 says to credit and charge the **unused** share. An upgrade on day 1
therefore produces almost nothing, and an upgrade on the last day credits and charges
almost the full month.

Fix: `const unused = 1 - prorationFactor(period, at);`

## 3. Graduated tiers treat `upTo` as a width, not a running total (rule 4)

**Line 217.** `tierWidth` is set to `tier.upTo`. Rule 4 and the `UsageTier` doc
comment (line 12) say `upTo` is a **running total** of billable units, so a tier's
width is `tier.upTo - previousCap`. `previousCap` is tracked on line 221 but never
used. Example: with tiers `[{upTo: 100}, {upTo: 200}, {upTo: null}]` and 300 billable
units, the code bills 100 at tier 1 and 200 at tier 2. The correct split is 100 / 100 / 100.

Fix: `const tierWidth = tier.upTo === null ? billable : tier.upTo - previousCap;`

## 4. Tax is calculated before credit is applied (rules 7 and 8)

**Lines 259–261.** Tax is taken on `subtotal - discount`, and then credit is applied
to the post-tax `due`. The rules say credit is applied after the discount and
**before tax** (rule 7), and tax is charged on the amount left after **both** the
discount and the credit (rule 8). As written, the customer pays tax on the part that
credit covered, and credit is used up against tax as well.

Fix:
```ts
const afterDiscount = subtotal - discount;
const credit = Math.min(account.creditBalanceCents, Math.max(0, afterDiscount));
const tax = percentOf(afterDiscount - credit, account.taxRatePercent);
const total = afterDiscount - credit + tax;
```

## 5. Previewing an invoice consumes account credit (rule 7)

**Line 261 → `applyCredit`, line 235.** `buildInvoice` calls `applyCredit`, which
subtracts from `account.creditBalanceCents`. `previewInvoice` (line 282) calls
`buildInvoice` directly, so a preview changes the account. This contradicts rule 7
and the doc comment on line 274 ("without changing the account").

## 6. Finalising an invoice deducts credit twice (rule 7)

**Line 294.** `finaliseInvoice` subtracts `invoice.creditAppliedCents` from the
balance, but `buildInvoice` has already done that through `applyCredit` (line 235).
Each finalised invoice removes twice the credit it used. The balance can go negative,
and the next `validateAccount` call then throws. The unused credit that should carry
forward is lost.

Fix for 5 and 6: `buildInvoice` should only **calculate** the credit to apply (no
mutation). Only `finaliseInvoice` should subtract it from the balance, once.

## 7. `formatMoney` does not zero-pad cents

**Line 304.** `abs % 100` is inserted without padding, so 105 cents renders as
`$1.5` instead of `$1.05`, and 100 renders as `$1.0` instead of `$1.00`. Every
rendered invoice with a cents part below 10 shows the wrong amount.

Fix: `` `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}` ``

## Minor / worth checking

- **Line 131 (rule 1), `percentOf`.** `Math.round` rounds halves toward +∞. For
  negative amounts, `-2.5` becomes `-2`, not `-3`. If "halves rounding up" means
  away from zero, negative amounts (for example a negative subtotal after proration
  credits) round the wrong way. `amountCents * percent / 100` is also floating-point
  and can land just below an exact `.5` when `percent` is fractional, so the half
  rounds down. Integer arithmetic (for example, using basis points) would avoid this.
- **Lines 246–247.** `validatePlan` is never called on the path that builds an
  invoice or changes a plan. Malformed tiers (unbounded middle tier, caps that don't
  increase) are silently accepted by `usageCharge`.
