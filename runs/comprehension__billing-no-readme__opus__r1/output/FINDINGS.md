# Review findings: `billing.ts`

Ordered by severity.

## 1. Tiered usage treats cumulative caps as tier widths (line 217)

```ts
const tierWidth = tier.upTo === null ? billable : tier.upTo;
```

`UsageTier.upTo` is the cumulative number of billable units the tier runs up to, and `validatePlan` (lines 100–105) requires the caps to strictly increase. So a tier's width is `tier.upTo - previousCap`, not `tier.upTo`. The loop already tracks `previousCap` (line 221) but never uses it.

Example: tiers `[{upTo: 100, 10¢}, {upTo: 200, 5¢}, {upTo: null, 1¢}]`, 300 billable units. Expected: 100×10 + 100×5 + 100×1 = 1600¢. Actual: 100×10 + 200×5 + 0 = 2000¢. Customers get billed at the more expensive middle tier for units that belong in a cheaper later tier.

**Fix:** `const tierWidth = tier.upTo === null ? billable : tier.upTo - previousCap;`

## 2. Proration uses the used share of the period instead of the unused share (line 182)

```ts
const unused = prorationFactor(period, at);
```

`prorationFactor` returns the share of the period *already used* (0 at the start, 1 at the end; see its doc comment on line 138). `changePlan` treats that number as the unused share. Both lines are wrong: the credit for "Unused time on <current>" and the charge for "Remaining time on <next>" grow as the period goes on, when they should shrink. A change on day 1 gives almost no credit and no charge, and a change on the last day gives a refund and charge for nearly the whole month.

**Fix:** `const unused = 1 - prorationFactor(period, at);`

## 3. `previewInvoice` changes the account's credit balance (lines 233–236, 261, 282)

`buildInvoice` calls `applyCredit`, and `applyCredit` subtracts from `account.creditBalanceCents` (line 235). `previewInvoice` is documented as "without changing the account", but it calls `buildInvoice` directly, so every preview uses up the customer's credit.

## 4. `finaliseInvoice` takes the credit off twice (line 294)

```ts
account.creditBalanceCents -= invoice.creditAppliedCents;
```

`buildInvoice` has already taken the applied credit off the balance through `applyCredit`, and line 294 takes it off again. With 1000¢ credit and 600¢ due, the balance ends up at −200¢ instead of 400¢. The negative balance then breaks the `isWholeCents` check in `validateAccount` (line 112), so the next `buildInvoice` for this account throws.

**Fix for 3 and 4:** make `applyCredit` only work out the amount without changing the account, and subtract it only in `finaliseInvoice`. The existing line 294 can stay as the one place that subtracts.

## 5. `formatMoney` doesn't zero-pad cents (line 304)

```ts
return `${sign}$${Math.floor(abs / 100)}.${abs % 100}`;
```

`abs % 100` isn't padded to two digits: 505¢ shows as `$5.5` (should be `$5.05`), 1000¢ as `$10.0`, and 0 as `$0.0`. Every amount on a rendered invoice with cents below 10 is wrong.

**Fix:** `String(abs % 100).padStart(2, "0")`.

## 6. Percent discount on a negative subtotal becomes a negative discount (lines 228–230)

When proration adjustments make the subtotal negative, `percentOf(subtotal, value)` is negative. `Math.min(raw, Math.max(0, subtotal))` keeps that negative number, so `discountCents` is negative. The discount then shrinks the customer's credit (subtotal −1000¢ with a 10% discount gives a net of −900¢), and `renderInvoice` shows it as a positive "Discount" line. The fixed-kind path can't go below zero, so the two kinds behave differently.

A negative subtotal can happen: an immediate change only needs `includedUnits` to go up (line 155), so the new plan can be cheaper than the old one.

**Fix:** clamp at zero, e.g. `Math.max(0, Math.min(raw, subtotalCents))`.

## 7. Validation lets NaN through (lines 115, 119)

`account.taxRatePercent < 0 || > 100` and the percent-discount range check are both false for `NaN`, so a `NaN` tax rate or discount passes validation. It then spreads through `percentOf` and gives `NaN` for tax and totals on the invoice. Check with `Number.isFinite` first.

## 8. Plans are never validated before billing (line 246)

`buildInvoice` calls `validateAccount`, which only checks that the plan IDs exist. It never calls `validatePlan`. A catalogue plan with non-increasing caps, a bounded last tier, or no tiers gets billed without an error. With no tiers, `usageCharge` quietly returns 0 however much usage there is. This is less clear-cut than 1–7 because the caller might validate the catalogue somewhere else, but nothing in this module makes sure it happens.
