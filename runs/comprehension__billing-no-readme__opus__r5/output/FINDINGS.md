# Findings: `billing.ts`

Ordered roughly by severity.

## 1. Mid-period plan changes are prorated with the wrong share (lines 182, 188, 192)

`prorationFactor` returns the share of the period **already used** (0 at the start, 1 at the end, see its doc comment on line 138). `changePlan` stores this in a variable called `unused` and uses it both to credit "Unused time on" the old plan and to charge "Remaining time on" the new plan. Both lines use the elapsed share when they should use the remaining share.

Example: a customer upgrades 1 day into a 30-day month. They get credit for only ~1/30 of the old price and pay only ~1/30 of the new price, when both should be ~29/30. An upgrade on the last day would credit and charge nearly the full month.

**Fix:** `const unused = 1 - prorationFactor(period, at);`

## 2. Tiered usage treats each tier's `upTo` as a width, not a cumulative cap (line 217)

`UsageTier.upTo` is the cumulative number of billable units a tier runs up to, and `validatePlan` requires the caps to strictly increase. `usageCharge` sets `tierWidth = tier.upTo`, so every tier after the first is too wide. `previousCap` is tracked (line 221) but never used.

Example: tiers `[{upTo: 100, 10¢}, {upTo: 200, 5¢}, {upTo: null, 1¢}]` with 300 billable units. The expected result is 100×10 + 100×5 + 100×1 = 1600¢. The code puts 100 units in tier 1 and 200 in tier 2 (width 200), so it charges 100×10 + 200×5 = 2000¢ and never reaches tier 3.

**Fix:** `const tierWidth = tier.upTo === null ? billable : tier.upTo - previousCap;`

## 3. `finaliseInvoice` deducts credit twice (line 294, together with line 235)

`buildInvoice` calls `applyCredit`, which already subtracts the applied amount from `account.creditBalanceCents` (line 235). `finaliseInvoice` then subtracts `invoice.creditAppliedCents` again. The customer loses twice the credit shown on the invoice, and the balance can go negative. That breaks the invariant `validateAccount` enforces, so the account's next invoice throws.

**Fix:** keep the credit calculation in `buildInvoice` free of side effects and deduct credit only in `finaliseInvoice`. Removing line 294 alone is not enough because of finding 4.

## 4. `previewInvoice` changes the account (lines 233–236, 261, 282)

The doc comment says preview works "without changing the account", but it calls `buildInvoice`, and that calls `applyCredit`, which uses up the account's credit. Each preview (a pricing page refresh, for example) reduces the customer's real credit balance.

**Fix:** have `applyCredit`/`buildInvoice` only compute `Math.min(balance, max(0, due))` and let `finaliseInvoice` apply the deduction.

## 5. Percent discount goes negative on a negative subtotal (line 230)

Proration adjustments can make the subtotal negative. `percentOf(negative, pct)` then returns a negative `raw`, and `Math.min(raw, Math.max(0, subtotal))` = `Math.min(negative, 0)` gives a negative discount. That discount pushes the amount the customer is owed back toward zero (subtotal −1000, 10% off → discount −100 → net −900). A discount should never be negative.

**Fix:** `return Math.max(0, Math.min(raw, subtotalCents));` (or return 0 when the subtotal is ≤ 0).

## 6. A negative invoice total is lost instead of becoming account credit (lines 234, 260–270)

If adjustments make `due` negative (for example, an immediate change to a plan with more included units but a lower price, after finding 1 is fixed), `applyCredit` applies 0 and the invoice total is negative. Nothing adds the refund to `creditBalanceCents` or carries it forward, so whatever the customer is owed disappears unless a caller handles it outside this module. Tax is also computed on the negative amount (line 259), which gives negative tax.

**Fix:** when `due < 0`, add `-due` to the account's credit balance on finalise and invoice a total of 0, or handle it explicitly somewhere else.

## 7. `formatMoney` doesn't zero-pad the cents (line 304)

`abs % 100` isn't padded, so 105 → `$1.5` (should be `$1.05`) and 100 → `$1.0` (should be `$1.00`). Every rendered invoice amount whose cents are under 10 is wrong.

**Fix:** `String(abs % 100).padStart(2, "0")`.

## 8. Plans are never validated before billing (lines 246–251)

`buildInvoice` validates the account but never calls `validatePlan`. A malformed catalogue entry (tiers with caps that don't increase, a missing unbounded last tier, fractional prices) goes straight into `usageCharge`. If there's no unbounded last tier, `usageCharge` silently skips every unit above the last cap. `validatePlan` is exported but nothing in this module calls it.

**Fix:** call `validatePlan(plan)` in `buildInvoice` (and in `changePlan` for the new plan), or validate the catalogue once at load time.

## Minor / robustness

- **Line 115, 119:** `NaN` gets through the tax-rate and percent-discount range checks (every comparison with `NaN` is false). The result is `NaN` tax or discount amounts. Add `Number.isFinite` checks.
- **Line 315:** if a line description is longer than `width - amount.length`, `padEnd` does nothing and the label runs straight into the amount with no space between them.
