import { Download, ExternalLink } from "lucide-react";
import { requireOwner } from "@/lib/auth";
import { getProject } from "@/lib/data/project";
import { loadFinance, summaryFor } from "@/lib/data/finance";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { formatCents } from "@/lib/domain/money";
import { INVOICE_STATE_LABELS } from "@/lib/domain/finance";
import { COST_CATEGORIES, COST_CATEGORY_LABELS } from "@/lib/domain/labels";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ActionButton } from "@/components/action-button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Table, Td, Th } from "@/components/ui/table";
import {
  addCost,
  addExtraWork,
  addFinanceDocument,
  addFollowup,
  addInvoice,
  addPayment,
  completeFollowup,
  deleteFinanceRow,
  setBookingAgreement,
  setExtraStatus,
  setInvoiceStatus,
  updateQuote,
} from "../_actions/finance";

const centsToInput = (c: number | null | undefined) => (c === null || c === undefined ? "" : (c / 100).toFixed(2).replace(".", ","));

export default async function ProjectFinancePage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const { s } = await getProject(id);
  const today = todayISO();
  const data = await loadFinance(s.supabase, [id]);
  const sum = summaryFor(data, id, today);
  const pf = data.projectFinances[0];
  const [{ data: bookings }, { data: agreements }, { data: docs }] = await Promise.all([
    s.supabase.from("bookings").select("id, role, status, freelancers(name)").eq("project_id", id),
    s.supabase.schema("finance").from("booking_agreements").select("*"),
    s.supabase.schema("finance").from("documents").select("id, title, kind, url, file_name, created_at").eq("project_id", id),
  ]);
  const agr = new Map((agreements ?? []).map((a) => [a.booking_id, a]));

  return (
    <div className="flex flex-col gap-5">
      <Alert tone="info">
        Alleen zichtbaar voor de eigenaar. Bedragen zijn exclusief btw, tenzij anders vermeld. <strong>Projectbijdrage</strong> = overeengekomen opbrengst (offerte + goedgekeurd meerwerk) − directe kosten. Eigen uren, overhead en belasting zitten er niet in; dit is géén nettowinst.
      </Alert>

      <section aria-label="Samenvatting" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Overeengekomen opbrengst" value={formatCents(sum.revenue_cents)} note={sum.approved_extra_cents ? `incl. ${formatCents(sum.approved_extra_cents)} meerwerk` : undefined} />
        <Stat label="Directe kosten (werkelijk)" value={formatCents(sum.actual_costs_cents)} note={`Begroot: ${formatCents(sum.budget_costs_cents)}`} />
        <Stat
          label="Projectbijdrage (werkelijk)"
          value={formatCents(sum.actual_contribution_cents)}
          note={sum.actual_contribution_pct !== null ? `${sum.actual_contribution_pct}% · begroot ${formatCents(sum.budget_contribution_cents)}${sum.budget_contribution_pct !== null ? ` (${sum.budget_contribution_pct}%)` : ""}` : "Onbekend zolang kosten of offerte ontbreken"}
        />
        <Stat label="Openstaand (incl. btw)" value={formatCents(sum.outstanding_cents)} note={`Betaald: ${formatCents(sum.paid_cents)} · nog te factureren excl.: ${formatCents(sum.not_yet_invoiced_excl_cents)}`} />
      </section>

      <Card>
        <CardHeader title="Offerte" />
        <CardBody>
          <ActionForm action={updateQuote.bind(null, id)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Offertebedrag (excl. btw)" htmlFor="q-amount" hint="Leeg = onbekend">
              <Input id="q-amount" name="quote_amount" inputMode="decimal" defaultValue={centsToInput(pf?.quote_amount_cents)} placeholder="€ 0,00" />
            </Field>
            <Field label="Offertenummer / referentie" htmlFor="q-ref">
              <Input id="q-ref" name="quote_reference" defaultValue={pf?.quote_reference ?? ""} maxLength={100} />
            </Field>
            <Field label="Verstuurd op" htmlFor="q-sent">
              <Input id="q-sent" name="quote_sent_on" type="date" defaultValue={pf?.quote_sent_on ?? ""} />
            </Field>
            <Field label="Btw-tarief (%)" htmlFor="q-vat">
              <Input id="q-vat" name="vat_rate_percent" type="number" step="0.01" min={0} max={100} defaultValue={pf?.vat_rate_percent ?? 21} />
            </Field>
            <Field label="Betalingsafspraken" htmlFor="q-terms" className="sm:col-span-2">
              <Input id="q-terms" name="payment_terms" defaultValue={pf?.payment_terms ?? ""} maxLength={500} />
            </Field>
            <Field label="Notities" htmlFor="q-notes" className="sm:col-span-2">
              <Input id="q-notes" name="notes" defaultValue={pf?.notes ?? ""} maxLength={3000} />
            </Field>
            <div>
              <SubmitButton size="sm">Opslaan</SubmitButton>
            </div>
          </ActionForm>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Meerwerk" description="Alleen goedgekeurd meerwerk telt mee in de opbrengst. Er wordt niet automatisch gefactureerd." />
        <CardBody className="flex flex-col gap-3">
          {data.extra.length > 0 && (
            <Table>
              <thead>
                <tr>
                  <Th>Omschrijving</Th>
                  <Th>Bedrag</Th>
                  <Th>Status</Th>
                  <Th>
                    <span className="sr-only">Acties</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {data.extra.map((e) => (
                  <tr key={e.id}>
                    <Td>{e.description}</Td>
                    <Td>{formatCents(e.amount_cents)}</Td>
                    <Td>
                      <Badge tone={e.status === "goedgekeurd" ? "ok" : e.status === "afgewezen" ? "neutral" : "warn"}>{e.status}</Badge>
                      {e.approved_on && <span className="ml-1 text-xs text-zinc-600">{formatDate(e.approved_on)}</span>}
                    </Td>
                    <Td className="whitespace-nowrap text-right">
                      {e.status !== "goedgekeurd" && (
                        <ActionButton size="sm" variant="ghost" action={setExtraStatus.bind(null, id, e.id, "goedgekeurd")}>
                          Goedkeuren
                        </ActionButton>
                      )}
                      {e.status !== "afgewezen" && (
                        <ActionButton size="sm" variant="ghost" action={setExtraStatus.bind(null, id, e.id, "afgewezen")}>
                          Afwijzen
                        </ActionButton>
                      )}
                      <ActionButton size="sm" variant="ghost" className="text-red-800" action={deleteFinanceRow.bind(null, id, "extra_work", e.id)} confirm="Meerwerk verwijderen?">
                        Verwijder
                      </ActionButton>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <ActionForm action={addExtraWork.bind(null, id)} resetOnSuccess className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end">
            <Field label="Omschrijving" htmlFor="ew-d">
              <Input id="ew-d" name="description" required maxLength={500} />
            </Field>
            <Field label="Bedrag (excl.)" htmlFor="ew-a">
              <Input id="ew-a" name="amount" inputMode="decimal" required placeholder="€ 0,00" />
            </Field>
            <Field label="Status" htmlFor="ew-s">
              <Select id="ew-s" name="status" defaultValue="voorgesteld">
                <option value="voorgesteld">Voorgesteld</option>
                <option value="goedgekeurd">Goedgekeurd</option>
                <option value="afgewezen">Afgewezen</option>
              </Select>
            </Field>
            <Field label="Goedgekeurd op" htmlFor="ew-o">
              <Input id="ew-o" name="approved_on" type="date" />
            </Field>
            <SubmitButton size="sm">Toevoegen</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Directe kosten" description="Begroot en werkelijk. Zonder kostenregels is de bijdrage onbekend (niet 100%)." />
        <CardBody className="flex flex-col gap-3">
          {data.costs.length > 0 && (
            <Table>
              <thead>
                <tr>
                  <Th>Soort</Th>
                  <Th>Categorie</Th>
                  <Th>Omschrijving</Th>
                  <Th>Bedrag</Th>
                  <Th>Datum</Th>
                  <Th>
                    <span className="sr-only">Acties</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {data.costs.map((c) => (
                  <tr key={c.id}>
                    <Td>
                      <Badge tone={c.kind === "werkelijk" ? "dark" : "neutral"}>{c.kind}</Badge>
                    </Td>
                    <Td>{COST_CATEGORY_LABELS[c.category as keyof typeof COST_CATEGORY_LABELS] ?? c.category}</Td>
                    <Td>
                      {c.description}
                      {c.supplier && <span className="text-xs text-zinc-600"> · {c.supplier}</span>}
                    </Td>
                    <Td>{formatCents(c.amount_cents)}</Td>
                    <Td>{formatDate(c.incurred_on)}</Td>
                    <Td className="text-right">
                      <ActionButton size="sm" variant="ghost" className="text-red-800" action={deleteFinanceRow.bind(null, id, "costs", c.id)} confirm="Kostenpost verwijderen?">
                        Verwijder
                      </ActionButton>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <ActionForm action={addCost.bind(null, id)} resetOnSuccess className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7 lg:items-end">
            <Field label="Soort" htmlFor="c-k">
              <Select id="c-k" name="kind" defaultValue="werkelijk">
                <option value="begroot">Begroot</option>
                <option value="werkelijk">Werkelijk</option>
              </Select>
            </Field>
            <Field label="Categorie" htmlFor="c-c">
              <Select id="c-c" name="category" defaultValue="freelancer">
                {COST_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {COST_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Omschrijving" htmlFor="c-d" className="lg:col-span-2">
              <Input id="c-d" name="description" required maxLength={500} />
            </Field>
            <Field label="Bedrag (excl.)" htmlFor="c-a">
              <Input id="c-a" name="amount" inputMode="decimal" required placeholder="€ 0,00" />
            </Field>
            <Field label="Datum" htmlFor="c-o">
              <Input id="c-o" name="incurred_on" type="date" />
            </Field>
            <SubmitButton size="sm">Toevoegen</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Tarieven crew" description="Financiële afspraken per boeking. Nooit in gedeelde crew-notities." />
        <CardBody>
          {(bookings ?? []).length === 0 ? (
            <p className="text-sm text-zinc-600">Geen boekingen.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {(bookings ?? []).map((b) => {
                const a = agr.get(b.id);
                const name = (b.freelancers as unknown as { name: string } | null)?.name;
                return (
                  <li key={b.id} className="rounded-md border border-zinc-200 p-3">
                    <p className="mb-2 text-sm font-semibold">
                      {name} · {b.role || "rol onbekend"} · {b.status}
                    </p>
                    <ActionForm action={setBookingAgreement.bind(null, id, b.id)} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_2fr_auto] sm:items-end">
                      <Field label="Tarief" htmlFor={`ba-r-${b.id}`}>
                        <Input id={`ba-r-${b.id}`} name="rate" inputMode="decimal" defaultValue={centsToInput(a?.rate_cents)} />
                      </Field>
                      <Field label="Per" htmlFor={`ba-u-${b.id}`}>
                        <Select id={`ba-u-${b.id}`} name="rate_unit" defaultValue={a?.rate_unit ?? "dag"}>
                          <option value="dag">dag</option>
                          <option value="halve_dag">halve dag</option>
                          <option value="uur">uur</option>
                          <option value="project">project</option>
                        </Select>
                      </Field>
                      <Field label="Afgesproken totaal" htmlFor={`ba-t-${b.id}`}>
                        <Input id={`ba-t-${b.id}`} name="agreed_total" inputMode="decimal" defaultValue={centsToInput(a?.agreed_total_cents)} />
                      </Field>
                      <Field label="Notities" htmlFor={`ba-n-${b.id}`}>
                        <Input id={`ba-n-${b.id}`} name="notes" defaultValue={a?.notes ?? ""} maxLength={1000} />
                      </Field>
                      <SubmitButton size="sm">Opslaan</SubmitButton>
                    </ActionForm>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Facturen en betalingen" description="Meerdere facturen en deelbetalingen. Betaald en openstaand worden afgeleid van geregistreerde betalingen." />
        <CardBody className="flex flex-col gap-4">
          {data.invoices.map((inv) => {
            const st = sum.invoices.find((i) => i.id === inv.id)!;
            const pays = data.payments.filter((p) => p.invoice_id === inv.id);
            return (
              <div key={inv.id} className="rounded-md border border-zinc-200 p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-bold">{inv.invoice_number}</span>
                  <Badge tone={st.state === "betaald" ? "ok" : st.state === "vervallen" ? "danger" : st.state === "deels_betaald" ? "warn" : "neutral"}>{INVOICE_STATE_LABELS[st.state]}</Badge>
                  <span>{inv.description}</span>
                  <span className="text-zinc-600">
                    · {formatDate(inv.issued_on)} · vervalt {formatDate(inv.due_on)}
                  </span>
                </div>
                <p className="mt-1 text-sm">
                  {formatCents(inv.amount_excl_cents)} excl. + {formatCents(inv.vat_cents)} btw = <strong>{formatCents(st.total_cents)}</strong> · betaald {formatCents(st.paid_cents)} · open{" "}
                  <strong>{formatCents(st.outstanding_cents)}</strong>
                </p>
                {pays.length > 0 && (
                  <ul className="mt-1 text-xs text-zinc-700">
                    {pays.map((p) => (
                      <li key={p.id} className="flex items-center gap-2">
                        {formatDate(p.received_on)}: {formatCents(p.amount_cents)} {p.reference && `(${p.reference})`}
                        <ActionButton size="sm" variant="ghost" action={deleteFinanceRow.bind(null, id, "payments", p.id)} confirm="Betaling verwijderen?">
                          Verwijder
                        </ActionButton>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 flex flex-wrap items-end gap-3">
                  {st.outstanding_cents > 0 && (
                    <ActionForm action={addPayment.bind(null, id, inv.id)} resetOnSuccess className="flex flex-wrap items-end gap-2">
                      <Field label="Ontvangen op" htmlFor={`p-d-${inv.id}`}>
                        <Input id={`p-d-${inv.id}`} name="received_on" type="date" defaultValue={today} required />
                      </Field>
                      <Field label="Bedrag (incl. btw)" htmlFor={`p-a-${inv.id}`}>
                        <Input id={`p-a-${inv.id}`} name="amount" inputMode="decimal" defaultValue={centsToInput(st.outstanding_cents)} required className="w-32" />
                      </Field>
                      <Field label="Referentie" htmlFor={`p-r-${inv.id}`}>
                        <Input id={`p-r-${inv.id}`} name="reference" maxLength={200} className="w-36" />
                      </Field>
                      <SubmitButton size="sm" variant="outline">
                        Betaling registreren
                      </SubmitButton>
                    </ActionForm>
                  )}
                  {inv.status !== "verstuurd" && (
                    <ActionButton size="sm" variant="ghost" action={setInvoiceStatus.bind(null, id, inv.id, "verstuurd")}>
                      Markeer verstuurd
                    </ActionButton>
                  )}
                  {inv.status !== "gecrediteerd" && (
                    <ActionButton size="sm" variant="ghost" action={setInvoiceStatus.bind(null, id, inv.id, "gecrediteerd")} confirm="Factuur als gecrediteerd markeren?">
                      Crediteren
                    </ActionButton>
                  )}
                  <ActionButton size="sm" variant="ghost" className="text-red-800" action={deleteFinanceRow.bind(null, id, "invoices", inv.id)} confirm="Factuur met betalingen verwijderen?">
                    Verwijder
                  </ActionButton>
                </div>
              </div>
            );
          })}
          <ActionForm action={addInvoice.bind(null, id)} resetOnSuccess className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7 lg:items-end">
            <Field label="Factuurnummer" htmlFor="i-n">
              <Input id="i-n" name="invoice_number" required maxLength={60} />
            </Field>
            <Field label="Omschrijving" htmlFor="i-d">
              <Input id="i-d" name="description" maxLength={500} />
            </Field>
            <Field label="Factuurdatum" htmlFor="i-i">
              <Input id="i-i" name="issued_on" type="date" defaultValue={today} required />
            </Field>
            <Field label="Vervaldatum" htmlFor="i-due">
              <Input id="i-due" name="due_on" type="date" required />
            </Field>
            <Field label="Bedrag excl. btw" htmlFor="i-a">
              <Input id="i-a" name="amount_excl" inputMode="decimal" required />
            </Field>
            <Field label="Btw" htmlFor="i-v" hint={`Leeg = ${pf?.vat_rate_percent ?? 21}%`}>
              <Input id="i-v" name="vat" inputMode="decimal" />
            </Field>
            <Field label="Status" htmlFor="i-s">
              <Select id="i-s" name="status" defaultValue="verstuurd">
                <option value="concept">Concept</option>
                <option value="verstuurd">Verstuurd</option>
              </Select>
            </Field>
            <div className="lg:col-span-7">
              <SubmitButton size="sm">Factuur toevoegen</SubmitButton>
            </div>
          </ActionForm>
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Financiële opvolging" description="Alleen voor jou. Verschijnt in je meldingen als de datum is bereikt." />
          <CardBody className="flex flex-col gap-3 text-sm">
            <ul className="divide-y divide-zinc-100">
              {data.followups.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 py-2">
                  <span className={f.done_at ? "text-zinc-500 line-through" : ""}>
                    {f.description} {f.due_on && <span className="text-xs text-zinc-600">· {formatDate(f.due_on)}</span>}
                  </span>
                  {!f.done_at && (
                    <ActionButton size="sm" variant="ghost" action={completeFollowup.bind(null, id, f.id)}>
                      Afgehandeld
                    </ActionButton>
                  )}
                </li>
              ))}
            </ul>
            <ActionForm action={addFollowup.bind(null, id)} resetOnSuccess className="flex flex-wrap items-end gap-2">
              <Field label="Omschrijving" htmlFor="fu-d" className="flex-1">
                <Input id="fu-d" name="description" required maxLength={500} />
              </Field>
              <Field label="Datum" htmlFor="fu-o">
                <Input id="fu-o" name="due_on" type="date" />
              </Field>
              <SubmitButton size="sm">Toevoegen</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Financiële documenten" description="Offertes met prijzen, facturen, inkoopbonnen. Alleen eigenaar." />
          <CardBody className="flex flex-col gap-3 text-sm">
            <ul className="divide-y divide-zinc-100">
              {(docs ?? []).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                  {d.kind === "link" ? (
                    <a href={d.url!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold underline">
                      {d.title} <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  ) : (
                    <a href={`/api/financien/documenten/${d.id}`} className="inline-flex items-center gap-1 font-semibold underline">
                      {d.title} <Download className="size-3.5" aria-hidden />
                    </a>
                  )}
                  <ActionButton size="sm" variant="ghost" className="text-red-800" action={deleteFinanceRow.bind(null, id, "documents", d.id)} confirm="Document verwijderen?">
                    Verwijder
                  </ActionButton>
                </li>
              ))}
            </ul>
            <ActionForm action={addFinanceDocument.bind(null, id)} resetOnSuccess encType="multipart/form-data" className="grid gap-2">
              <Field label="Titel" htmlFor="fd-t">
                <Input id="fd-t" name="title" required maxLength={200} />
              </Field>
              <Field label="Bestand (max. 10 MB)" htmlFor="fd-f">
                <Input id="fd-f" name="file" type="file" className="py-1.5" />
              </Field>
              <Field label="…of link" htmlFor="fd-u">
                <Input id="fd-u" name="url" type="url" placeholder="https://" />
              </Field>
              <div>
                <SubmitButton size="sm">Toevoegen</SubmitButton>
              </div>
            </ActionForm>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <p className="text-sm font-semibold text-zinc-700">{label}</p>
      <p className="mt-1 font-heading text-2xl font-extrabold">{value}</p>
      {note && <p className="mt-1 text-xs text-zinc-600">{note}</p>}
    </div>
  );
}
