# Findings: billing.ts

## 1. Line 304: cents are not zero-padded

`formatMoney` interpolates `abs % 100` directly, so any amount whose cents
part is below 10 loses its leading zero: 1005 cents renders as `$10.5` and
1001 as `$10.1`. Every rendered invoice line with such an amount is wrong.
It should be `String(abs % 100).padStart(2, "0")`.

## 2. Line 217: usage tiers bill their cumulative cap as their width

`upTo` is a running total of billable units, but the loop uses `tier.upTo`
as the number of units the tier holds. It should be `tier.upTo - previousCap`
(`previousCap` is tracked for exactly this and never used). With tiers of
100, 300 and unlimited, 350 units are billed 100 + 250 + 0 instead of
100 + 200 + 50, so every tier after the first overbills.

## 3. Line 182: proration uses the elapsed share as the unused share

`prorationFactor` (lines 138-143) returns the share of the period already
used, from 0 at the start to 1 at the end. `changePlan` stores it as
`unused` and credits the old plan and charges the new plan for that share.
An upgrade six days into a 30-day month credits and charges 20% instead of
80%. It should be `1 - prorationFactor(period, at)`.

## 4. Line 235: building an invoice consumes account credit

`applyCredit` deducts from `account.creditBalanceCents`, and it runs inside
`buildInvoice`, which both `previewInvoice` and `finaliseInvoice` call. So
previewing an invoice spends the customer's credit, breaking the contract
that a preview does not change the account (line 274). `finaliseInvoice`
then deducts `creditAppliedCents` again at line 294, so a finalised invoice
consumes the credit twice and can drive the balance negative. `applyCredit`
should only compute the amount.

## 5. Line 259: tax is charged before credit is applied

`buildInvoice` taxes the discounted subtotal and only then applies credit
to the taxed amount (line 261). The README (rules 7 and 8) requires credit
to come off the discounted subtotal first, with tax charged on what is
left, so every invoice that uses credit is overtaxed: a 10000 cent invoice
with 2000 credit at 10% tax should be tax 800 and total 8800, not tax 1000
and total 9000. Credit should be computed from `subtotal - discount`, and
tax from `subtotal - discount - credit`.

## 6. Line 155: plan-change timing is decided by included units, not price

The README (rule 5) makes a change immediate only when the new plan has a
higher monthly price; a lower or equal price waits for the period end with
no proration. `planChangeTiming` instead goes immediate whenever the new
plan has more included units, so a move to a cheaper plan with more units
is applied at once and prorated into a net credit, while a move to a
pricier plan with no extra units wrongly waits. It should compare
`monthlyPriceCents`.
