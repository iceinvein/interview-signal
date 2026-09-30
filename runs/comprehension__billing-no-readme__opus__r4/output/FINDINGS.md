# billing.ts review findings

Ordered roughly by severity.

## 1. Credit is deducted twice when an invoice is finalised — line 294 (with line 261)

`buildInvoice` calls `applyCredit` (line 261), which already subtracts the applied
amount from `account.creditBalanceCents` (line 235). `finaliseInvoice` then subtracts
`invoice.creditAppliedCents` a second time (line 294).

Example: credit 1000, invoice due 600 → `applyCredit` leaves 400, then line 294 leaves
**-200**. The customer loses credit they never used, and the balance can go negative,
after which `validateAccount` rejects the account on the next invoice.

Fix: have `buildInvoice` only compute the credit (`Math.min(balance, Math.max(0, due))`)
without mutating, and deduct it only in `finaliseInvoice`.

## 2. `previewInvoice` changes the account — line 282 (via line 261 / 235)

The doc comment says preview works "without changing the account", but it calls
`buildInvoice`, and that call consumes credit through `applyCredit`. Every preview
permanently spends the customer's credit balance. Same fix as #1.

## 3. Plan-change proration uses the *used* share instead of the *unused* share — line 182

`prorationFactor` returns the share of the period **already used** (0 at start, 1 at
end), but its result is stored as `unused` and used both to refund the old plan and to
charge the new plan for the "remaining" time (lines 188, 192). It should be
`1 - prorationFactor(period, at)`.

Example: upgrading on day 3 of 30 refunds and charges only ~10% of each plan instead of
~90%. Upgrading on the last day refunds/charges almost the full month.

## 4. Tiered usage treats `upTo` as the tier width instead of a cumulative cap — line 217

`UsageTier.upTo` is the cumulative number of billable units a tier runs up to (and
`validatePlan` requires caps to strictly increase), so a tier's width is
`tier.upTo - previousCap`. The code uses `tier.upTo` as the width. `previousCap` is
kept up to date (line 221) but never read.

Example: tiers `[{upTo: 100, 10c}, {upTo: 200, 5c}, {upTo: null, 1c}]`, 250 billable
units. Correct: 100×10 + 100×5 + 50×1 = 1550. Code: 100×10 + 150×5 = 1750, because the
second tier absorbs 150 units rather than 100, and the unbounded tier is never reached.

## 5. `formatMoney` doesn't zero-pad cents — line 304

`abs % 100` is printed without padding, so 105 cents renders as `$1.5` (means $1.50)
and 1 cent renders as `$0.1`. Use `String(abs % 100).padStart(2, "0")`.

## 6. Percent discount on a negative subtotal becomes a surcharge — line 230

When proration credits make the subtotal negative (e.g. an immediate change to a plan
with more included units but a lower price), `percentOf` returns a negative `raw`, and
`Math.min(raw, Math.max(0, subtotal))` = `Math.min(negative, 0)` keeps it negative. A
negative discount **increases** the amount due (line 260) and renders as a positive
"Discount" row. The result should be clamped at a floor of 0 as well:
`Math.max(0, Math.min(raw, subtotal))`.
