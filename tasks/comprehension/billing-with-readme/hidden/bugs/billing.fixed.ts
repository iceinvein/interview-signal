/**
 * Subscription billing: plan changes, metered usage, discounts, tax and
 * account credit, producing one invoice per billing period.
 *
 * All money is integer cents. All dates are UTC. A billing period is one
 * calendar month, starting at 00:00 UTC on the 1st.
 */

export type Cents = number;

export interface UsageTier {
  /** Billable units (after included units) this tier runs up to; null means no limit. */
  upTo: number | null;
  unitPriceCents: Cents;
}

export interface Plan {
  id: string;
  name: string;
  monthlyPriceCents: Cents;
  /** Units covered by the monthly price before usage tiers apply. */
  includedUnits: number;
  usageTiers: UsageTier[];
}

export interface BillingPeriod {
  /** Inclusive. */
  start: Date;
  /** Exclusive. */
  end: Date;
}

export interface Discount {
  code: string;
  kind: "percent" | "fixed";
  /** Percent from 0 to 100, or an amount in cents. */
  value: number;
}

export interface Account {
  id: string;
  planId: string;
  /** Plan that takes over at the next renewal, if a change is scheduled. */
  pendingPlanId: string | null;
  creditBalanceCents: Cents;
  taxRatePercent: number;
  discount: Discount | null;
}

export interface LineItem {
  description: string;
  amountCents: Cents;
}

export interface Invoice {
  accountId: string;
  period: BillingPeriod;
  lines: LineItem[];
  subtotalCents: Cents;
  discountCents: Cents;
  taxCents: Cents;
  creditAppliedCents: Cents;
  totalCents: Cents;
}

export class BillingError extends Error {}

// ---------------------------------------------------------------------------
// Catalogue and validation

export function findPlan(catalogue: Plan[], planId: string): Plan {
  const plan = catalogue.find((candidate) => candidate.id === planId);
  if (!plan) throw new BillingError(`unknown plan ${planId}`);
  return plan;
}

function isWholeCents(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

export function validatePlan(plan: Plan): void {
  if (!isWholeCents(plan.monthlyPriceCents)) {
    throw new BillingError(`plan ${plan.id}: price must be whole, non-negative cents`);
  }
  if (!Number.isInteger(plan.includedUnits) || plan.includedUnits < 0) {
    throw new BillingError(`plan ${plan.id}: included units must be a non-negative integer`);
  }
  if (plan.usageTiers.length === 0) {
    throw new BillingError(`plan ${plan.id}: needs at least one usage tier`);
  }
  let previousCap = 0;
  plan.usageTiers.forEach((tier, index) => {
    const isLast = index === plan.usageTiers.length - 1;
    if (!isWholeCents(tier.unitPriceCents)) {
      throw new BillingError(`plan ${plan.id}: tier ${index} price must be whole cents`);
    }
    if (isLast !== (tier.upTo === null)) {
      throw new BillingError(`plan ${plan.id}: only the last tier may be unbounded`);
    }
    if (tier.upTo !== null) {
      if (tier.upTo <= previousCap) {
        throw new BillingError(`plan ${plan.id}: tier caps must strictly increase`);
      }
      previousCap = tier.upTo;
    }
  });
}

export function validateAccount(account: Account, catalogue: Plan[]): void {
  findPlan(catalogue, account.planId);
  if (account.pendingPlanId !== null) findPlan(catalogue, account.pendingPlanId);
  if (!isWholeCents(account.creditBalanceCents)) {
    throw new BillingError(`account ${account.id}: credit must be whole, non-negative cents`);
  }
  if (account.taxRatePercent < 0 || account.taxRatePercent > 100) {
    throw new BillingError(`account ${account.id}: tax rate must be between 0 and 100`);
  }
  const discount = account.discount;
  if (discount?.kind === "percent" && (discount.value < 0 || discount.value > 100)) {
    throw new BillingError(`account ${account.id}: percent discount must be between 0 and 100`);
  }
  if (discount?.kind === "fixed" && !isWholeCents(discount.value)) {
    throw new BillingError(`account ${account.id}: fixed discount must be whole cents`);
  }
}

// ---------------------------------------------------------------------------
// Arithmetic

export function percentOf(amountCents: Cents, percent: number): Cents {
  return Math.round((amountCents * percent) / 100);
}

export function sumLines(lines: LineItem[]): Cents {
  return lines.reduce((total, line) => total + line.amountCents, 0);
}

/** Share of the period already used at `at`, from 0 at the start to 1 at the end. */
export function prorationFactor(period: BillingPeriod, at: Date): number {
  const length = period.end.getTime() - period.start.getTime();
  const used = at.getTime() - period.start.getTime();
  return Math.min(1, Math.max(0, used / length));
}

export function prorate(amountCents: Cents, share: number): Cents {
  return Math.round(amountCents * share);
}

// ---------------------------------------------------------------------------
// Plan changes

export function planChangeTiming(current: Plan, next: Plan): "immediate" | "period-end" {
  return next.monthlyPriceCents > current.monthlyPriceCents ? "immediate" : "period-end";
}

/**
 * Moves the account to `newPlanId` at `at`, part-way through `period`.
 * Returns the proration lines to add to the next invoice; a change that
 * waits for the period end is recorded on the account and returns none.
 */
export function changePlan(
  account: Account,
  catalogue: Plan[],
  newPlanId: string,
  period: BillingPeriod,
  at: Date,
): LineItem[] {
  const current = findPlan(catalogue, account.planId);
  const next = findPlan(catalogue, newPlanId);
  if (current.id === next.id) {
    account.pendingPlanId = null;
    return [];
  }

  if (planChangeTiming(current, next) === "period-end") {
    account.pendingPlanId = next.id;
    return [];
  }

  const unused = 1 - prorationFactor(period, at);
  account.planId = next.id;
  account.pendingPlanId = null;
  return [
    {
      description: `Unused time on ${current.name}`,
      amountCents: -prorate(current.monthlyPriceCents, unused),
    },
    {
      description: `Remaining time on ${next.name}`,
      amountCents: prorate(next.monthlyPriceCents, unused),
    },
  ];
}

/** Starts the next period, switching to any plan change that was waiting for it. */
export function renew(account: Account, period: BillingPeriod): BillingPeriod {
  if (account.pendingPlanId !== null) {
    account.planId = account.pendingPlanId;
    account.pendingPlanId = null;
  }
  const start = period.end;
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return { start, end };
}

// ---------------------------------------------------------------------------
// Charges

export function usageCharge(plan: Plan, unitsUsed: number): Cents {
  let billable = Math.max(0, unitsUsed - plan.includedUnits);
  let charge = 0;
  let previousCap = 0;
  for (const tier of plan.usageTiers) {
    if (billable <= 0) break;
    const tierWidth = tier.upTo === null ? billable : tier.upTo - previousCap;
    const units = Math.min(billable, tierWidth);
    charge += units * tier.unitPriceCents;
    billable -= units;
    previousCap = tier.upTo ?? previousCap;
  }
  return charge;
}

export function discountAmount(subtotalCents: Cents, discount: Discount | null): Cents {
  if (discount === null) return 0;
  const raw =
    discount.kind === "percent" ? percentOf(subtotalCents, discount.value) : discount.value;
  return Math.min(raw, Math.max(0, subtotalCents));
}

function creditToApply(account: Account, amountDueCents: Cents): Cents {
  return Math.min(account.creditBalanceCents, Math.max(0, amountDueCents));
}

function buildInvoice(
  account: Account,
  catalogue: Plan[],
  period: BillingPeriod,
  unitsUsed: number,
  adjustments: LineItem[],
): Invoice {
  validateAccount(account, catalogue);
  const plan = findPlan(catalogue, account.planId);
  const lines: LineItem[] = [
    { description: `${plan.name} subscription`, amountCents: plan.monthlyPriceCents },
  ];
  const usage = usageCharge(plan, unitsUsed);
  if (usage > 0) {
    lines.push({ description: `Usage (${unitsUsed} units)`, amountCents: usage });
  }
  lines.push(...adjustments);

  const subtotal = sumLines(lines);
  const discount = discountAmount(subtotal, account.discount);
  const tax = percentOf(subtotal - discount, account.taxRatePercent);
  const due = subtotal - discount + tax;
  const credit = creditToApply(account, due);
  return {
    accountId: account.id,
    period,
    lines,
    subtotalCents: subtotal,
    discountCents: discount,
    taxCents: tax,
    creditAppliedCents: credit,
    totalCents: due - credit,
  };
}

/** Shows what the invoice for `period` would be, without changing the account. */
export function previewInvoice(
  account: Account,
  catalogue: Plan[],
  period: BillingPeriod,
  unitsUsed: number,
  adjustments: LineItem[],
): Invoice {
  return buildInvoice(account, catalogue, period, unitsUsed, adjustments);
}

/** Issues the invoice for `period` and consumes the credit it uses. */
export function finaliseInvoice(
  account: Account,
  catalogue: Plan[],
  period: BillingPeriod,
  unitsUsed: number,
  adjustments: LineItem[],
): Invoice {
  const invoice = buildInvoice(account, catalogue, period, unitsUsed, adjustments);
  account.creditBalanceCents -= invoice.creditAppliedCents;
  return invoice;
}

// ---------------------------------------------------------------------------
// Presentation

export function formatMoney(cents: Cents): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function renderInvoice(invoice: Invoice): string {
  const width = 48;
  const row = (label: string, cents: Cents) => {
    const amount = formatMoney(cents);
    return `${label.padEnd(width - amount.length)}${amount}`;
  };
  const lastDay = new Date(invoice.period.end.getTime() - 86_400_000);
  return [
    `Invoice for ${invoice.accountId}`,
    `Period ${formatDate(invoice.period.start)} to ${formatDate(lastDay)}`,
    "",
    ...invoice.lines.map((line) => row(line.description, line.amountCents)),
    "-".repeat(width),
    row("Subtotal", invoice.subtotalCents),
    row("Discount", -invoice.discountCents),
    row("Tax", invoice.taxCents),
    row("Credit applied", -invoice.creditAppliedCents),
    row("Total due", invoice.totalCents),
  ].join("\n");
}
