# Findings: billing.ts

## Definite bugs

1. **Line 217: tier width is the cumulative cap, not the tier's width.**
   `UsageTier.upTo` is the cumulative billable-unit cap (see the interface comment and the strictly-increasing check in `validatePlan`). `tierWidth` should be `tier.upTo - previousCap`. As written, tier 2 (for example, `upTo: 200` after `upTo: 100`) is treated as 200 units wide, so tiers overbill at the earlier price. `previousCap` is tracked at line 221 but never read, which points to this omission.

2. **Line 235 (with 294): credit is deducted twice, and `previewInvoice` mutates the account.**
   `applyCredit` (called from `buildInvoice`) already subtracts the applied credit from `account.creditBalanceCents`. `finaliseInvoice` then subtracts `creditAppliedCents` again at line 294, so customers lose double the credit they used. `previewInvoice` goes through `buildInvoice` too, so it consumes credit despite its doc comment ("without changing the account"). Each preview drains the balance. `buildInvoice` should compute the credit without mutating, and only `finaliseInvoice` should deduct it.

3. **Line 182 (used in 188 and 193): proration uses the share used, not the share unused.**
   `prorationFactor` returns the share of the period already used, but the variable is named `unused` and is applied as if it were the remaining share. The credit for the old plan and the charge for the new plan should both use `1 - used`. Mid-month, the results are correct only at exactly 50%. At the start of the period, the old plan gets almost no credit and the new plan almost no charge, and the reverse happens at the end.

4. **Line 304: cents are not zero-padded.**
   `abs % 100` is interpolated directly, so 5 cents renders as `$0.5`, and $12.05 renders as `$12.5`. It needs `String(abs % 100).padStart(2, "0")`.

## Likely bugs and design problems

5. **Lines 249 and 185-194: an immediate plan change can double-bill.**
   `changePlan` sets `account.planId` to the new plan straight away. `buildInvoice` then charges the full `monthlyPriceCents` of the new plan (line 249) and adds the proration lines as adjustments. The invoice ends up with the full new-plan price, minus a slice of the old plan, plus a slice of the new plan. The new plan is charged more than once and the old plan's full price is never billed. Either the subscription line should be for the plan in force at the start of the period, or the proration should be applied on top of an old-plan base. Check this against how invoices are meant to be assembled.

6. **Lines 226-230: percent discounts misbehave when the subtotal is negative.**
   Large negative proration adjustments can push the subtotal below zero. `percentOf` then returns a negative amount, and `Math.min(raw, Math.max(0, subtotal))` keeps the negative value. The "discount" becomes a surcharge, and tax at line 259 is also computed on a negative base. The discount should be clamped to `>= 0` on both sides.

## Minor and robustness issues

7. **Line 130 (and 146): `Math.round` rounds half-values up on negative amounts.**
   For example, -2.5 becomes -2 while +2.5 becomes 3. Negative proration credits and positive charges therefore round asymmetrically by a cent.

8. **Line 139-142: zero-length period.**
   If `period.end` equals `period.start`, `length` is 0 and the factor is `NaN`. `Math.min`/`Math.max` propagate it, so `prorate` returns `NaN` and the invoice total becomes `NaN`.

9. **Lines 115 and 119: NaN passes validation.**
   `NaN < 0` and `NaN > 100` are both false, so a `NaN` tax rate or percent discount is accepted. Use `Number.isFinite` checks. `unitsUsed` is also never validated. Negative or fractional values flow straight into `usageCharge`.
