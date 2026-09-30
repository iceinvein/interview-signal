# Review of `billing.ts` against `README.md`

Ordered roughly by impact on the amount billed.

## 1. Plan-change timing is decided by included units, not by price (rule 5)

**`billing.ts:155`** — `planChangeTiming` returns `"immediate"` when
`next.includedUnits > current.includedUnits`. Rule 5 says the test is the
**monthly price**. An immediate change should happen only when
`next.monthlyPriceCents > current.monthlyPriceCents`, and anything else
(lower or equal price) waits for the next period. With the current code, a
cheaper plan that has more included units is switched and prorated straight
away. A pricier plan with the same or fewer included units is deferred and
never prorated. The comment on lines 153–154 describes the wrong rule too.

## 2. Proration uses the *used* share as if it were the *unused* share (rule 5)

**`billing.ts:182`** — `prorationFactor` returns the share of the period
already **used** (its doc comment says "0 at the start to 1 at the end"). The
result is stored in a variable called `unused` and used directly on lines 188
and 192. Rule 5 credits and charges the **unused** share, so this should be
`1 - prorationFactor(period, at)`. An upgrade on day 1 currently prorates
almost nothing. An upgrade on the last day credits and charges almost a full
month.

## 3. Usage tiers treat `upTo` as a width instead of a running total (rule 4)

**`billing.ts:217`** — `tierWidth = tier.upTo`. Rule 4 (and the `UsageTier`
doc comment on line 12) says `upTo` is a **running total** of billable units,
so the width of a tier is `tier.upTo - previousCap`. `previousCap` is kept up
to date on line 221 but never used. Example: tiers `[{upTo: 100}, {upTo: 200},
{upTo: null}]` with 250 billable units should be 100 + 100 + 50 units. The
code bills 100 + 200 + 0 units, so too many units get the second tier's rate
and the third tier is skipped.

## 4. Tax is calculated before credit instead of after it (rules 7 and 8)

**`billing.ts:259–261`** — Tax is `percentOf(subtotal - discount, rate)`, and
then credit is applied to `subtotal - discount + tax`. Rule 7 says credit comes
off after the discount and **before tax**. Rule 8 says tax is charged on the
amount left after **both** the discount and the credit. The correct order is:

```
afterDiscount = subtotal - discount
credit        = min(balance, max(0, afterDiscount))
tax           = percentOf(afterDiscount - credit, rate)
total         = afterDiscount - credit + tax
```

As written, the customer pays tax on the part covered by credit, and credit
is also used up against tax.

## 5. Previewing an invoice consumes credit (rule 7)

**`billing.ts:235`** (called from `buildInvoice` at **line 261**, reached
through `previewInvoice` at **line 282**) — `applyCredit` subtracts the
applied credit from `account.creditBalanceCents`. Because `buildInvoice` is
shared, `previewInvoice` changes the account's balance. This breaks "Previewing
an invoice must not change the account" and contradicts the doc comment on
line 274. `applyCredit` should only work out the amount, and only
`finaliseInvoice` should update the balance.

## 6. Finalising an invoice takes the credit off twice (rule 7)

**`billing.ts:294`** — `buildInvoice` has already taken the credit off the
balance (see #5), and `finaliseInvoice` then subtracts
`invoice.creditAppliedCents` again. Each finalised invoice removes twice the
credit it used, and the balance can go **negative**. After that,
`validateAccount` (line 112) throws on the next invoice. Carried-forward
credit (rule 7) is lost. The fix for #5 and #6 together is to calculate credit
without side effects in `buildInvoice` and subtract it exactly once here.

## 7. `formatMoney` does not zero-pad cents

**`billing.ts:304`** — `${abs % 100}` is not padded, so 105 cents renders as
`$1.5` instead of `$1.05`, and 100 renders as `$1.0`. It should use
`String(abs % 100).padStart(2, "0")`. Every amount of 0–9 cents in the
rendered invoice shows the wrong value.

## 8. Rounding of negative halves goes toward zero, not up (rule 1)

**`billing.ts:131`** and **`billing.ts:146`** — `Math.round` rounds `-2.5` to
`-2` (checked in Node). For negative amounts, halves round toward zero, which
differs from how positive amounts round. `percentOf` can get a negative input
when the subtotal is negative (for example, from large negative adjustments
or bug #1). This is a small edge case. If finance means "halves away from
zero", the rounding should be done on the absolute value and the sign put
back afterwards.

## 9. A negative subtotal produces a negative discount (rule 6)

**`billing.ts:228–230`** — With a percent discount and a negative subtotal,
`percentOf` returns a negative `raw`, and `Math.min(raw, 0)` keeps it. The
result is a negative discount, which **adds** to the amount due. The discount
should be clamped to `0 ≤ discount ≤ max(0, subtotal)`. This only happens
with negative subtotals, so it is low severity, but rule 6 only allows a
discount to reduce the invoice.

## 10. Plans are never validated

**`billing.ts:246–247`** — `buildInvoice` validates the account but never calls
`validatePlan` on the plan it bills. Nothing else in the module calls it
either. A plan with fractional prices, empty tiers or tier caps that don't
increase is priced silently by `usageCharge`, which gives wrong results that
don't follow rules 1 and 4. `validatePlan(plan)` should be called after line
247, or on the whole catalogue.
