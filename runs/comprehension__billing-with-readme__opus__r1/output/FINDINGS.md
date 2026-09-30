# Findings: `billing.ts` vs. README billing rules

Ordered by the rule each one breaks.

## 1. Plan-change timing is decided by included units, not price (Rule 5)

**`billing.ts:155`** — `planChangeTiming` returns `"immediate"` when
`next.includedUnits > current.includedUnits`. Rule 5 says the deciding
factor is the **monthly price**: a move to a higher-priced plan takes effect
immediately, and a move to a lower- or equal-priced plan waits for the next
period.

Failure: moving to a cheaper plan that includes more units is applied at once,
with proration (the account gets a credit it isn't owed). Moving to a pricier
plan with the same or fewer included units gets scheduled for next period with
no proration, so the account doesn't pay the upgrade charge for the rest of the
current period.

Fix: `next.monthlyPriceCents > current.monthlyPriceCents ? "immediate" : "period-end"`.

## 2. Proration uses the *used* share of the period, not the *unused* share (Rule 5)

**`billing.ts:182`** (used at 188 and 192) — `prorationFactor` returns the
share of the period **already used** (0 at the start, 1 at the end; see its
doc comment at line 138). `changePlan` stores this in a variable named
`unused` and uses it for both the credit and the charge. Rule 5 says to credit
the unused share on the old plan and charge the same share on the new plan.

Failure: if the account upgrades on day 3 of 30, it gets credited and charged
for 10% of the period instead of 90%. If it upgrades on the last day, it's
charged almost a full month's difference.

Fix: `const unused = 1 - prorationFactor(period, at);`

## 3. Graduated tiers use the cumulative cap as the tier width (Rule 4)

**`billing.ts:217`** — `tierWidth` is set to `tier.upTo`, but `upTo` is a
running total of billable units (Rule 4 and the comment at line 12). The
tier's width is `tier.upTo - previousCap`. The code tracks `previousCap` at
line 221 but never uses it.

Failure: with tiers `[{upTo:100, 10¢}, {upTo:300, 5¢}, {upTo:null, 1¢}]` and
400 billable units, the code puts 100 units in tier 1, **300** in tier 2 and 0
in tier 3, for 2,500¢. The correct split is 100 / 200 / 100, for 2,100¢.
Every tier after the first gets too many units.

Fix: `const tierWidth = tier.upTo === null ? billable : tier.upTo - previousCap;`

## 4. Credit is applied after tax instead of before it (Rule 7)

**`billing.ts:260–261`** — `due` already includes tax, and credit is then
taken off `due`. Rule 7 says credit applies to the subtotal after the discount
and **before tax**, and never takes that amount below zero.

Failure: the credit can go toward the tax as well, so more credit is used than
Rule 7 allows. The invoice's credit and total don't match what finance signed
off.

## 5. Tax is charged before credit is deducted (Rule 8)

**`billing.ts:259`** — tax is `percentOf(subtotal - discount, taxRate)`.
Rule 8 says tax is charged on the amount left after **both** the discount and
the credit.

Failure: an account with credit pays tax on the part of the invoice its credit
already covered. With a subtotal of 10,000¢, no discount, 4,000¢ of credit and
10% tax, the code charges 1,000¢ tax and a total of 7,000¢. The correct figures
are 600¢ tax and a total of 6,600¢.

Fix for 4 and 5 together:
```ts
const afterDiscount = subtotal - discount;
const credit = Math.min(account.creditBalanceCents, Math.max(0, afterDiscount));
const taxable = afterDiscount - credit;
const tax = percentOf(taxable, account.taxRatePercent);
const total = taxable + tax;
```

## 6. Previewing an invoice consumes the account's credit (Rule 7)

**`billing.ts:235`** (reached through `buildInvoice` at 261 and
`previewInvoice` at 282) — `applyCredit` changes
`account.creditBalanceCents`. `buildInvoice` is shared by preview and finalise,
so `previewInvoice` spends credit. This breaks Rule 7 ("Previewing an invoice
must not change the account") and contradicts the doc comment at line 274.

Failure: each preview reduces the account's credit balance. Previewing and then
finalising uses the credit twice.

Fix: have `buildInvoice` only *compute* the credit to apply
(`Math.min(balance, Math.max(0, amount))`) and never change the account.

## 7. Finalising an invoice deducts the credit twice (Rule 7)

**`billing.ts:294`** — `finaliseInvoice` subtracts
`invoice.creditAppliedCents` from the balance, but `buildInvoice` already did
that through `applyCredit` (line 235).

Failure: an account with 5,000¢ of credit and a 3,000¢ invoice ends up with
−1,000¢ instead of 2,000¢. The balance goes negative, which breaks the
"unused credit carries forward" rule. The next `validateAccount` call (line
112) will then throw for that account.

Fix: once finding 6 is fixed (`buildInvoice` doesn't change the account), line
294 is the only deduction and is correct.

## 8. Cents are not zero-padded when money is formatted (Rule 1 / presentation)

**`billing.ts:304`** — `${abs % 100}` isn't padded to two digits.

Failure: `formatMoney(105)` renders `"$1.5"` instead of `"$1.05"`, and
`formatMoney(1000)` renders `"$10.0"`. Every amount with fewer than 10 cents is
shown wrong on rendered invoices, and a customer would read `$1.5` as $1.50.

Fix: `String(abs % 100).padStart(2, "0")`.

---

### Checked and found consistent with the rules

- `renew` (198–206): moves to the 1st of the next UTC month. `Date.UTC` rolls
  December over to January correctly. The scheduled plan is applied.
- `changePlan` same-plan branch (172–175): cancels any scheduled change, as
  Rule 5 requires.
- `discountAmount` (226–231): percent or fixed, capped at the subtotal
  (Rule 6).
- `percentOf` / `prorate`: `Math.round` rounds halves up for the non-negative
  amounts these functions get. A brute-force check of non-integer tax rates
  found no floating-point rounding errors.
- Subscription line (249): full monthly price of the current plan (Rule 3).
