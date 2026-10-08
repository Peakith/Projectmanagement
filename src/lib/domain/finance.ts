/**
 * Projectbijdrage = overeengekomen opbrengst (offerte + goedgekeurd meerwerk) − directe kosten.
 * Eigen uren, overhead en belasting zitten er niet in; dit is géén nettowinst.
 * Alle bedragen in eurocenten. Opbrengst en kosten exclusief btw.
 */
export type FinanceInput = {
  quote_amount_cents: number | null;
  extra_work: { amount_cents: number; status: string }[];
  costs: { kind: "begroot" | "werkelijk"; amount_cents: number }[];
  invoices: { id: string; amount_excl_cents: number; vat_cents: number; status: string; due_on: string }[];
  payments: { invoice_id: string; amount_cents: number }[];
};

export type InvoiceSummary = {
  id: string;
  total_cents: number;
  paid_cents: number;
  outstanding_cents: number;
  state: "concept" | "open" | "deels_betaald" | "betaald" | "vervallen" | "gecrediteerd";
};

export type FinanceSummary = {
  revenue_cents: number | null;
  approved_extra_cents: number;
  budget_costs_cents: number | null;
  actual_costs_cents: number | null;
  budget_contribution_cents: number | null;
  budget_contribution_pct: number | null;
  actual_contribution_cents: number | null;
  actual_contribution_pct: number | null;
  invoiced_excl_cents: number;
  invoiced_incl_cents: number;
  paid_cents: number;
  outstanding_cents: number;
  not_yet_invoiced_excl_cents: number | null;
  invoices: InvoiceSummary[];
};

export function summarizeInvoice(
  inv: FinanceInput["invoices"][number],
  payments: FinanceInput["payments"],
  today: string,
): InvoiceSummary {
  const total = inv.amount_excl_cents + inv.vat_cents;
  const paid = payments.filter((p) => p.invoice_id === inv.id).reduce((s, p) => s + p.amount_cents, 0);
  const outstanding = inv.status === "gecrediteerd" || inv.status === "concept" ? 0 : Math.max(total - paid, 0);
  let state: InvoiceSummary["state"];
  if (inv.status === "gecrediteerd") state = "gecrediteerd";
  else if (inv.status === "concept") state = "concept";
  else if (paid >= total) state = "betaald";
  else if (inv.due_on < today) state = "vervallen";
  else if (paid > 0) state = "deels_betaald";
  else state = "open";
  return { id: inv.id, total_cents: total, paid_cents: paid, outstanding_cents: outstanding, state };
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

export function summarizeFinance(input: FinanceInput, today: string): FinanceSummary {
  const approvedExtra = input.extra_work.filter((e) => e.status === "goedgekeurd").reduce((s, e) => s + e.amount_cents, 0);
  const revenue = input.quote_amount_cents === null ? null : input.quote_amount_cents + approvedExtra;

  const budgetLines = input.costs.filter((c) => c.kind === "begroot");
  const actualLines = input.costs.filter((c) => c.kind === "werkelijk");
  // Ontbrekende kostencalculatie = onbekend, niet 0.
  const budget = budgetLines.length ? budgetLines.reduce((s, c) => s + c.amount_cents, 0) : null;
  const actual = actualLines.length ? actualLines.reduce((s, c) => s + c.amount_cents, 0) : null;

  const invoices = input.invoices.map((i) => summarizeInvoice(i, input.payments, today));
  const countable = input.invoices.filter((i) => i.status !== "gecrediteerd" && i.status !== "concept");
  const invoicedExcl = countable.reduce((s, i) => s + i.amount_excl_cents, 0);
  const invoicedIncl = countable.reduce((s, i) => s + i.amount_excl_cents + i.vat_cents, 0);
  const paid = invoices.filter((i) => i.state !== "gecrediteerd" && i.state !== "concept").reduce((s, i) => s + i.paid_cents, 0);
  const outstanding = invoices.reduce((s, i) => s + i.outstanding_cents, 0);

  const budgetContribution = revenue !== null && budget !== null ? revenue - budget : null;
  const actualContribution = revenue !== null && actual !== null ? revenue - actual : null;

  return {
    revenue_cents: revenue,
    approved_extra_cents: approvedExtra,
    budget_costs_cents: budget,
    actual_costs_cents: actual,
    budget_contribution_cents: budgetContribution,
    budget_contribution_pct: budgetContribution !== null && revenue ? pct(budgetContribution, revenue) : null,
    actual_contribution_cents: actualContribution,
    actual_contribution_pct: actualContribution !== null && revenue ? pct(actualContribution, revenue) : null,
    invoiced_excl_cents: invoicedExcl,
    invoiced_incl_cents: invoicedIncl,
    paid_cents: paid,
    outstanding_cents: outstanding,
    not_yet_invoiced_excl_cents: revenue === null ? null : Math.max(revenue - invoicedExcl, 0),
    invoices,
  };
}

export const INVOICE_STATE_LABELS: Record<InvoiceSummary["state"], string> = {
  concept: "Concept",
  open: "Open",
  deels_betaald: "Deels betaald",
  betaald: "Betaald",
  vervallen: "Vervallen",
  gecrediteerd: "Gecrediteerd",
};

/** Btw-bedrag in centen, afgerond op hele centen. */
export function vatCents(amountExclCents: number, ratePercent: number): number {
  return Math.round((amountExclCents * ratePercent) / 100);
}
