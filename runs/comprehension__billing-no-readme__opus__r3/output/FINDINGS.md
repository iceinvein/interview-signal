# billing.ts review findings

Ordered by severity.

## 1. Credit is consumed twice when finalising, and previewing also consumes it (lines 235, 261, 294)

`buildInvoice` calls `applyCredit` (line 261), which deducts the applied credit from
`account.creditBalanceCents` (line 235). Then `finaliseInvoice` deducts
`invoice.creditAppliedCents` a second time (line 294).

- `finaliseInvoice`: an account with 1000 cents of credit and a 1000-cent invoice ends
  up with a balance of -1000 instead of 0. The customer loses credit they never used,
  and the next `validateAccount` throws because credit is now negative.
- `previewInvoice` (line 282): its doc comment says it does not change the account, but it
  goes through the same `buildInvoice` path, so a preview uses up the customer's credit.

Fix: make `applyCredit` pure (return `Math.min(balance, Math.max(0, due))` without writing
to the account) and deduct only in `finaliseInvoice`.

## 2. Tiered usage treats each tier's cumulative cap as its width (line 217)

`upTo` is a cumulative cap ("billable units this tier runs up to"), and `validatePlan`
requires the caps to strictly increase. `usageCharge` uses `tier.upTo` as the number of
units in the tier, but the width should be `tier.upTo - previousCap`. `previousCap` is
tracked (line 221) but never used.

Example: tiers `[{upTo: 100, 10¢}, {upTo: 200, 5¢}, {upTo: null, 1¢}]` with 300 billable
units. The correct charge is 100×10 + 100×5 + 100×1 = 1600. The code puts 100 units in
tier 1 and the remaining 200 in tier 2 (width 200), charging 100×10 + 200×5 = 2000. Every
tier after the first gets too many units.

## 3. Plan-change proration uses the used share as the unused share (line 182)

`prorationFactor` returns the share of the period **already used** (0 at the start, 1 at
the end; see its doc comment at line 138). `changePlan` stores that result in `unused` and
uses it both to credit the old plan and to charge the new one. It should be
`1 - prorationFactor(period, at)`.

Example: an upgrade on day 1 of the month credits and charges almost nothing. An upgrade
on the last day credits and charges almost the full month, the opposite of what should
happen.

## 4. `formatMoney` does not zero-pad the cents (line 304)

`abs % 100` is printed without padding. 105 cents prints as `$1.5` instead of `$1.05`,
and 100 prints as `$1.0`. Every amount with fewer than 10 cents is displayed wrong on
rendered invoices. Fix: `String(abs % 100).padStart(2, "0")`.

## 5. Possible issue: a mid-period plan change is billed against the new plan for the whole period (lines 247–255)

`buildInvoice` prices the full subscription line and all of `unitsUsed` using whatever
plan the account is on when the invoice is built. The doc comment at line 160 says the
proration lines go on the *next* invoice. That fits in-advance billing, where the next
invoice charges the new plan in full and the proration covers the rest of the current
period. But the same invoice also bills usage for `period`, which only works in arrears.
If invoices for a period are built after it ends, an account that changed plan partway
through pays the new plan's full price **plus** the proration difference. All of that
period's usage is also priced on the new plan's included units and tiers. It's worth
confirming which billing model is intended.

## Minor issues

- **Line 115 / 119 / 130**: `NaN` gets past the range checks for `taxRatePercent` and
  percent discounts, because every comparison with `NaN` is false. `percentOf` then
  returns `NaN` and it spreads through the whole invoice. Add a `Number.isFinite` check.
- **Line 100–104**: tier caps aren't checked to be integers, so a fractional `upTo` is
  accepted.
- **Line 246**: `buildInvoice` validates the account but never calls `validatePlan` on the
  plan it bills, so a malformed catalogue entry (for example a non-last unbounded tier)
  is used without being checked.
- **Line 142**: `prorationFactor` returns `NaN` for a zero-length period (0/0), and
  `Math.min`/`Math.max` don't catch `NaN`.
- **Line 131**: `Math.round` rounds half toward +∞, so a negative amount rounds differently
  from the matching positive one (for example -2.5 → -2 but 2.5 → 3). Credit and charge
  lines for the same amount can then fail to cancel out.
- **Line 253**: the usage line's label shows total `unitsUsed`, including included units,
  while the amount charged is only for billable units, so the label is misleading.
- **Line 315**: if a description is longer than `width - amount.length`, `padEnd` adds no
  space and the label runs straight into the amount.
