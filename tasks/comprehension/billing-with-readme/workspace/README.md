# Billing

Subscription billing for a metered SaaS product. `billing.ts` turns an
account, its plan and a month of usage into an invoice.

## Billing rules

These are the rules finance has signed off. The code is expected to follow
them exactly.

1. **Money.** Every amount is an integer number of cents. Percentages are
   applied to cents and rounded to the nearest cent, halves rounding up.
2. **Periods.** A billing period is one calendar month in UTC, from 00:00 on
   the 1st (inclusive) to 00:00 on the 1st of the next month (exclusive).
3. **Subscription charge.** Each invoice charges the full monthly price of
   the plan the account is on when the invoice is built.
4. **Usage.** Units up to the plan's included allowance are free. Units
   beyond it are billable and priced on graduated tiers: each tier's `upTo`
   is a running total of billable units, and each unit is charged at the
   rate of the tier it falls in.
5. **Plan changes.** A move to a plan with a higher monthly price takes
   effect immediately. The account is credited for the unused share of the
   current period on the old plan and charged for the same share on the new
   plan. A move to a plan with a lower or equal monthly price takes effect
   at the start of the next period, with no proration and no credit.
   Choosing the current plan again cancels any scheduled change.
6. **Discounts.** An account has at most one discount, either a percentage
   or a fixed amount, applied to the invoice subtotal. A discount never
   exceeds the subtotal.
7. **Tax.** Tax is charged at the account's rate on the subtotal after the
   discount has been taken off.
8. **Credit.** Account credit is applied last, after tax, and never takes
   the total below zero. Unused credit carries forward. Previewing an
   invoice must not change the account; only finalising an invoice
   consumes credit.

## API

- `changePlan(account, catalogue, newPlanId, period, at)` switches plan or
  schedules the switch, returning proration lines for the next invoice.
- `renew(account, period)` starts the next period and applies any scheduled
  plan change.
- `previewInvoice(...)` and `finaliseInvoice(...)` build the invoice for a
  period; only the second one commits credit usage.
- `renderInvoice(invoice)` formats an invoice as plain text.
