import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { requireOwner } from "@/lib/auth";
import { loadFinance, summaryFor } from "@/lib/data/finance";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { formatCents } from "@/lib/domain/money";
import { INVOICE_STATE_LABELS } from "@/lib/domain/finance";
import { PHASE_LABELS, type Phase } from "@/lib/domain/labels";
import { PageHeader, Alert, EmptyState } from "@/components/ui/misc";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th } from "@/components/ui/table";

export const metadata: Metadata = { title: "Financiën" };

export default async function FinancePage() {
  const s = await requireOwner();
  const today = todayISO();
  const [{ data: projects }, data] = await Promise.all([
    s.supabase.from("projects").select("id, name, phase, archived_at, clients(name)").order("name"),
    loadFinance(s.supabase),
  ]);
  const rows = (projects ?? []).map((p) => ({ p, sum: summaryFor(data, p.id, today) }));
  const visible = rows.filter((r) => !r.p.archived_at && (r.sum.revenue_cents !== null || r.sum.invoices.length > 0 || r.sum.actual_costs_cents !== null));
  const totals = visible.reduce(
    (t, r) => ({ revenue: t.revenue + (r.sum.revenue_cents ?? 0), invoiced: t.invoiced + r.sum.invoiced_incl_cents, paid: t.paid + r.sum.paid_cents, outstanding: t.outstanding + r.sum.outstanding_cents }),
    { revenue: 0, invoiced: 0, paid: 0, outstanding: 0 },
  );
  const overdue = data.invoices
    .map((i) => ({ i, st: rows.find((r) => r.p.id === i.project_id)?.sum.invoices.find((x) => x.id === i.id) }))
    .filter((x) => x.st?.state === "vervallen");
  const followups = data.followups.filter((f) => !f.done_at);
  const pName = new Map((projects ?? []).map((p) => [p.id, p.name]));

  return (
    <>
      <PageHeader
        title="Financiën"
        description="Afgeschermd overzicht voor de eigenaar. Bedragen excl. btw tenzij vermeld."
        actions={
          <Button asChild variant="outline">
            <a href="/api/export/financien">
              <Download aria-hidden /> Exporteren (CSV)
            </a>
          </Button>
        }
      />
      <section aria-label="Totalen" className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Overeengekomen opbrengst", formatCents(totals.revenue)],
          ["Gefactureerd (incl. btw)", formatCents(totals.invoiced)],
          ["Ontvangen", formatCents(totals.paid)],
          ["Openstaand (incl. btw)", formatCents(totals.outstanding)],
        ].map(([l, v]) => (
          <div key={l} className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-sm font-semibold text-zinc-700">{l}</p>
            <p className="mt-1 font-heading text-2xl font-extrabold">{v}</p>
          </div>
        ))}
      </section>
      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Facturen die opvolging nodig hebben" />
          {overdue.length === 0 ? (
            <p className="p-4 text-sm text-zinc-600">Geen vervallen facturen.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 text-sm">
              {overdue.map(({ i, st }) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                  <Link href={`/projecten/${i.project_id}/financien`} className="font-semibold hover:underline">
                    {i.invoice_number}
                  </Link>
                  <span>{pName.get(i.project_id)}</span>
                  <Badge tone="danger">Vervallen {formatDate(i.due_on)}</Badge>
                  <span>open {formatCents(st?.outstanding_cents)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Financiële opvolging" />
          {followups.length === 0 ? (
            <p className="p-4 text-sm text-zinc-600">Niets op te volgen.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 text-sm">
              {followups.map((f) => (
                <li key={f.id} className="px-4 py-2">
                  <span className={f.due_on && f.due_on <= today ? "font-semibold text-red-800" : ""}>{formatDate(f.due_on)}</span> · {f.description}
                  {f.project_id && (
                    <Link href={`/projecten/${f.project_id}/financien`} className="ml-1 text-zinc-600 underline">
                      {pName.get(f.project_id)}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card>
        <CardHeader title="Per project" description="Projectbijdrage = opbrengst − directe kosten (geen nettowinst). Onbekend = gegevens ontbreken." />
        {visible.length === 0 ? (
          <div className="p-4">
            <EmptyState title="Nog geen financiële gegevens" />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Project</Th>
                <Th>Opbrengst</Th>
                <Th>Kosten (werkelijk)</Th>
                <Th>Bijdrage</Th>
                <Th>Gefactureerd</Th>
                <Th>Openstaand</Th>
                <Th>Facturen</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ p, sum }) => (
                <tr key={p.id}>
                  <Td>
                    <Link href={`/projecten/${p.id}/financien`} className="font-semibold hover:underline">
                      {p.name}
                    </Link>
                    <p className="text-xs text-zinc-600">
                      {(p.clients as unknown as { name: string } | null)?.name} · {PHASE_LABELS[p.phase as Phase]}
                    </p>
                  </Td>
                  <Td>{formatCents(sum.revenue_cents)}</Td>
                  <Td>{formatCents(sum.actual_costs_cents)}</Td>
                  <Td>
                    {formatCents(sum.actual_contribution_cents)}
                    {sum.actual_contribution_pct !== null && <span className="text-xs text-zinc-600"> ({sum.actual_contribution_pct}%)</span>}
                  </Td>
                  <Td>{formatCents(sum.invoiced_incl_cents)}</Td>
                  <Td className={sum.outstanding_cents > 0 ? "font-semibold" : ""}>{formatCents(sum.outstanding_cents)}</Td>
                  <Td className="text-xs">
                    {sum.invoices.map((i) => (
                      <Badge key={i.id} tone={i.state === "betaald" ? "ok" : i.state === "vervallen" ? "danger" : i.state === "deels_betaald" ? "warn" : "neutral"} className="mr-1">
                        {INVOICE_STATE_LABELS[i.state]}
                      </Badge>
                    ))}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <div className="mt-4">
        <Alert tone="info">Dit is een praktisch projectoverzicht, geen boekhoudpakket. Leg facturen en betalingen per project vast onder Project → Financiën.</Alert>
      </div>
    </>
  );
}
