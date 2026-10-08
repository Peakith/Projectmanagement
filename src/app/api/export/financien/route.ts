import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { loadFinance, summaryFor } from "@/lib/data/finance";
import { csvResponse, toCsv } from "@/lib/csv";
import { todayISO } from "@/lib/domain/dates";

const eur = (c: number | null) => (c === null ? "onbekend" : (c / 100).toFixed(2).replace(".", ","));

/** Financiële export: uitsluitend eigenaar (expliciete rolcheck + RLS). */
export async function GET() {
  const s = await getSession();
  if (s?.role !== "owner") return new NextResponse("Niet gevonden", { status: 404 });
  const today = todayISO();
  const [{ data: projects }, data] = await Promise.all([s.supabase.from("projects").select("id, name").order("name"), loadFinance(s.supabase)]);
  const rows: (string | number | null)[][] = [
    ["Project", "Opbrengst excl. btw", "Goedgekeurd meerwerk", "Begrote kosten", "Werkelijke kosten", "Bijdrage (werkelijk)", "Bijdrage %", "Gefactureerd incl. btw", "Betaald", "Openstaand"],
  ];
  for (const p of projects ?? []) {
    const x = summaryFor(data, p.id, today);
    if (x.revenue_cents === null && x.invoices.length === 0 && x.actual_costs_cents === null) continue;
    rows.push([p.name, eur(x.revenue_cents), eur(x.approved_extra_cents), eur(x.budget_costs_cents), eur(x.actual_costs_cents), eur(x.actual_contribution_cents), x.actual_contribution_pct, eur(x.invoiced_incl_cents), eur(x.paid_cents), eur(x.outstanding_cents)]);
  }
  return csvResponse(`financien-${today}.csv`, toCsv(rows));
}
