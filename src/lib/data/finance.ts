import "server-only";
import type { Session } from "@/lib/auth";
import { summarizeFinance, type FinanceInput } from "@/lib/domain/finance";

type DB = Session["supabase"];

export type Invoice = { id: string; project_id: string; invoice_number: string; description: string; issued_on: string; due_on: string; amount_excl_cents: number; vat_cents: number; status: string };

/** Alleen aanroepen voor de eigenaar; RLS geeft anderen sowieso lege resultaten. */
export async function loadFinance(db: DB, projectIds?: string[]) {
  const f = db.schema("finance");
  const ids = projectIds ?? null;
  const pfQ = f.from("project_finances").select("*");
  const exQ = f.from("extra_work").select("*").order("created_at");
  const coQ = f.from("costs").select("*").order("created_at");
  const inQ = f.from("invoices").select("*").order("issued_on");
  const fuQ = f.from("followups").select("*").order("due_on");
  const [pf, extra, costs, invoices, followups] = await Promise.all([
    ids ? pfQ.in("project_id", ids) : pfQ,
    ids ? exQ.in("project_id", ids) : exQ,
    ids ? coQ.in("project_id", ids) : coQ,
    ids ? inQ.in("project_id", ids) : inQ,
    ids ? fuQ.in("project_id", ids) : fuQ,
  ]);
  const invIds = (invoices.data ?? []).map((i) => i.id);
  const { data: payments } = invIds.length ? await f.from("payments").select("*").in("invoice_id", invIds).order("received_on") : { data: [] };
  return {
    projectFinances: (pf.data ?? []) as { project_id: string; quote_amount_cents: number | null; quote_reference: string; quote_sent_on: string | null; vat_rate_percent: number; payment_terms: string; notes: string }[],
    extra: (extra.data ?? []) as { id: string; project_id: string; description: string; amount_cents: number; status: string; approved_on: string | null }[],
    costs: (costs.data ?? []) as { id: string; project_id: string; kind: "begroot" | "werkelijk"; category: string; description: string; supplier: string; amount_cents: number; incurred_on: string | null; booking_id: string | null }[],
    invoices: (invoices.data ?? []) as Invoice[],
    payments: (payments ?? []) as { id: string; invoice_id: string; received_on: string; amount_cents: number; reference: string }[],
    followups: (followups.data ?? []) as { id: string; project_id: string | null; description: string; due_on: string | null; done_at: string | null }[],
  };
}

export function summaryFor(data: Awaited<ReturnType<typeof loadFinance>>, projectId: string, today: string) {
  const input: FinanceInput = {
    quote_amount_cents: data.projectFinances.find((p) => p.project_id === projectId)?.quote_amount_cents ?? null,
    extra_work: data.extra.filter((e) => e.project_id === projectId),
    costs: data.costs.filter((c) => c.project_id === projectId),
    invoices: data.invoices.filter((i) => i.project_id === projectId),
    payments: data.payments.filter((p) => data.invoices.some((i) => i.id === p.invoice_id && i.project_id === projectId)),
  };
  return summarizeFinance(input, today);
}
