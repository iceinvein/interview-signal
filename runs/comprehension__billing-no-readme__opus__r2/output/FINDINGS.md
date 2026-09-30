# billing.ts review findings

Ordered roughly by severity.

## 1. `finaliseInvoice` deducts account credit twice — line 294 (with line 261)

`buildInvoice` calls `applyCredit` (line 261), which already subtracts the applied
amount from `account.creditBalanceCents` (line 235). `finaliseInvoice` then subtracts
`invoice.creditAppliedCents` again at line 294. Each finalised invoice consumes twice
the credit it actually used. The balance can also go negative: with a balance of 500
and 500 applied, it ends at -500.

## 2. `previewInvoice` changes the account — lines 261 / 233–236

Its doc comment says it shows the invoice "without changing the account", but it goes
through `buildInvoice` → `applyCredit`, which changes `creditBalanceCents`. Each preview
uses up the customer's credit. Fix: `applyCredit` should only compute the amount, and
only `finaliseInvoice` should change the balance. That also fixes #1.

## 3. Proration uses the elapsed share instead of the remaining share — line 182

`prorationFactor` returns the share of the period **already used** (its doc comment
says 0 at start, 1 at end). `changePlan` stores that in a variable named `unused` and
uses it for both "Unused time on old plan" and "Remaining time on new plan". The share
should be `1 - prorationFactor(period, at)`. Example: an upgrade on day 1 of the month
credits and charges almost nothing, while an upgrade on the last day credits and
charges almost a full month.

## 4. Tiered usage treats each tier's cap as its width — line 217

`upTo` is a cumulative cap ("billable units this tier runs up to", and
`validatePlan` requires caps to strictly increase). The width of a tier is
`tier.upTo - previousCap`, but the code uses `tier.upTo`. `previousCap` is tracked
(line 221) but never read. Example: tiers `[{upTo:100, 10¢}, {upTo:200, 5¢}, {upTo:null, 1¢}]`
with 250 billable units should be 100×10 + 100×5 + 50×1 = 1550¢. The code charges
100×10 + 150×5 = 1750¢, putting all 150 remaining units in tier 2.

## 5. `formatMoney` doesn't zero-pad cents — line 304

`abs % 100` is printed without padding. 105¢ renders as `$1.5` instead of `$1.05`, and
100¢ renders as `$1.0`. It should be `String(abs % 100).padStart(2, "0")`.

## 6. Percent discount and tax go negative when the subtotal is negative — lines 229–230, 259

Negative adjustments, such as a large proration credit, can make the subtotal
negative. `percentOf(subtotal, value)` then gives a negative discount. `Math.min(raw, 0)`
keeps it negative, so the "discount" adds to the amount owed and renders as a
positive discount row. Tax is also calculated on a negative base, which produces
negative tax. The discount should be clamped to `>= 0`, and tax should be calculated
on `Math.max(0, subtotal - discount)`, or credit balances should be handled explicitly.

## 7. Minor

- **Line 115 / 119:** range checks don't reject `NaN` (`NaN < 0` and `NaN > 100` are
  both false), so a `NaN` tax rate or percent discount passes validation and makes
  every amount `NaN`.
- **Line 246–247:** `buildInvoice` validates the account but never calls
  `validatePlan`, so malformed tiers (such as a missing unbounded last tier) are billed
  anyway. If usage is higher than the last cap, the extra units are silently not charged.
- **Line 253:** the usage line shows total `unitsUsed` rather than the billable units
  actually charged (after `includedUnits`), which misleads the customer.
