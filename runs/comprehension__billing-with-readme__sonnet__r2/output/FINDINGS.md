# Findings: `billing.ts` vs `README.md` billing rules

## Bugs

1. **Plan change timing ignores price (line 155, rule 5).**
   `planChangeTiming` compares `includedUnits`, but the rule says a move is immediate only if the new plan's `monthlyPriceCents` is higher. A cheaper plan with more included units is applied immediately, and a pricier plan with fewer or equal units is deferred. A move to an equal price must be deferred.

2. **Proration uses the used share as the unused share (lines 182-193, rule 5).**
   `prorationFactor` returns the share of the period already used, but the variable is called `unused` and applied to both lines. The old-plan credit and new-plan charge should use `1 - used`. An upgrade near the start of a period is credited and charged almost nothing, instead of almost the whole month.

3. **Graduated tiers use the cap as the tier width (line 217, rule 4).**
   `upTo` is a running total, but `tierWidth` is `tier.upTo` and not `tier.upTo - previousCap`. For tiers `[100, 500, null]`, tier 2 is treated as 500 units wide, not 400, so units are charged at the wrong rate. `previousCap` is tracked (line 221) but never used.

4. **Credit is applied after tax, not before it (lines 259-261, rule 7 and 8).**
   Tax is computed on `subtotal - discount`, and credit is taken off `due` (which includes tax). The rules say credit comes off the discounted subtotal first, and tax is charged on what is left. Tax should be `percentOf(max(0, subtotal - discount - credit), rate)`. Currently credit also offsets tax, so the tax is overstated whenever credit is present.

5. **Preview mutates the account (lines 233-237, 261, rule 7).**
   `applyCredit` decrements `account.creditBalanceCents`, and `buildInvoice` calls it. `previewInvoice` therefore consumes credit, which breaks "previewing must not change the account". Credit computation must be pure, with only `finaliseInvoice` deducting.

6. **Finalising consumes credit twice (lines 261 and 294, rule 7).**
   `buildInvoice` already deducts the credit, and `finaliseInvoice` deducts `creditAppliedCents` again. The balance drops by twice the credit used. It can go negative, or it can be clamped wrongly on later invoices. Fixing #5 fixes this too.

7. **`formatMoney` does not pad cents (line 304).**
   `abs % 100` is not zero-padded, so 1005 cents renders as `$10.5` and 100 cents as `$1.0`. It needs `String(abs % 100).padStart(2, "0")`.

## Lower-confidence issues

8. **Percent discount on a negative subtotal (line 230, rule 6).**
   If adjustments push the subtotal below zero, `raw` is negative and `Math.min(raw, 0)` returns the negative value. The discount then increases the invoice. The discount should be clamped to the range `[0, max(0, subtotal)]`.

9. **Floating-point rounding (lines 131, 146, rule 1).**
   Percentages and proration multiply by floats (fractional tax rates and the `used / length` share) before `Math.round`. A true half can land just below `.5` and round down, which breaks "halves round up". Using integer arithmetic, such as scaled rates or a rational share, avoids this.

10. **No validation on inputs (lines 246 and 211, rule 2).**
    `validatePlan` is never called by `buildInvoice`. `period` is never checked to be a UTC calendar month (1st 00:00 to next 1st 00:00), and `unitsUsed` is never checked to be a non-negative number.
