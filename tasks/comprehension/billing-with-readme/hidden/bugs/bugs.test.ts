// One test per planted bug, named by its answer-key id. Run against the fixed
// module every test passes; run against the workspace module each one fails,
// which is what proves the bug is real. BILLING_MODULE picks the module.
import { describe, expect, test } from "vitest";
import type * as Billing from "../../workspace/billing.ts";

const modulePath = process.env.BILLING_MODULE;
if (!modulePath) throw new Error("BILLING_MODULE must name the module under test");
const billing: typeof Billing = await import(modulePath);

const april: Billing.BillingPeriod = {
  start: new Date("2026-04-01T00:00:00Z"),
  end: new Date("2026-05-01T00:00:00Z"),
};

function plan(overrides: Partial<Billing.Plan>): Billing.Plan {
  return {
    id: "plan",
    name: "Plan",
    monthlyPriceCents: 1000,
    includedUnits: 0,
    usageTiers: [{ upTo: null, unitPriceCents: 0 }],
    ...overrides,
  };
}

function account(overrides: Partial<Billing.Account>): Billing.Account {
  return {
    id: "acct",
    planId: "basic",
    pendingPlanId: null,
    creditBalanceCents: 0,
    taxRatePercent: 0,
    discount: null,
    ...overrides,
  };
}

describe("planted bugs", () => {
  test("visible-money-format: formatMoney pads cents to two digits", () => {
    expect(billing.formatMoney(1005)).toBe("$10.05");
  });

  test("visible-usage-tiers: each graduated tier bills only its own width", () => {
    const metered = plan({
      usageTiers: [
        { upTo: 100, unitPriceCents: 10 },
        { upTo: 300, unitPriceCents: 5 },
        { upTo: null, unitPriceCents: 2 },
      ],
    });
    // 100 units at 10, 200 at 5, 50 at 2.
    expect(billing.usageCharge(metered, 350)).toBe(2100);
  });

  test("trace-proration-direction: an upgrade credits and charges the unused share", () => {
    const catalogue = [
      plan({ id: "basic", name: "Basic", monthlyPriceCents: 1000, includedUnits: 100 }),
      plan({ id: "pro", name: "Pro", monthlyPriceCents: 3000, includedUnits: 500 }),
    ];
    // 6 of April's 30 days are used, so 80% of the period remains.
    const lines = billing.changePlan(
      account({ planId: "basic" }),
      catalogue,
      "pro",
      april,
      new Date("2026-04-07T00:00:00Z"),
    );
    expect(lines.map((line) => line.amountCents)).toEqual([-800, 2400]);
  });

  test("trace-preview-credit: previewing an invoice leaves the credit balance alone", () => {
    const catalogue = [plan({ id: "basic", monthlyPriceCents: 2000 })];
    const customer = account({ planId: "basic", creditBalanceCents: 500 });
    billing.previewInvoice(customer, catalogue, april, 0, []);
    expect(customer.creditBalanceCents).toBe(500);
  });

  test("rule-tax-after-discount: tax is charged on the discounted subtotal", () => {
    const catalogue = [plan({ id: "basic", monthlyPriceCents: 10000 })];
    const customer = account({
      planId: "basic",
      taxRatePercent: 10,
      discount: { code: "TENOFF", kind: "percent", value: 10 },
    });
    const invoice = billing.previewInvoice(customer, catalogue, april, 0, []);
    expect(invoice.taxCents).toBe(900);
  });

  test("rule-downgrade-timing: a move to a cheaper plan waits for the period end", () => {
    const catalogue = [
      plan({ id: "team", name: "Team", monthlyPriceCents: 3000, includedUnits: 100 }),
      plan({ id: "bulk", name: "Bulk", monthlyPriceCents: 2000, includedUnits: 200 }),
    ];
    const customer = account({ planId: "team" });
    const lines = billing.changePlan(
      customer,
      catalogue,
      "bulk",
      april,
      new Date("2026-04-07T00:00:00Z"),
    );
    expect({ lines, planId: customer.planId, pendingPlanId: customer.pendingPlanId }).toEqual({
      lines: [],
      planId: "team",
      pendingPlanId: "bulk",
    });
  });
});
