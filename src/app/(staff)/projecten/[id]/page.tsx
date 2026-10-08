import Link from "next/link";
import { getProject } from "@/lib/data/project";
import { lookups } from "@/lib/data/overview";
import { computeAttention } from "@/lib/domain/attention";
import { closureIssues } from "@/lib/domain/closure";
import { formatDate, relativeDay, todayISO } from "@/lib/domain/dates";
import { summarizeFinance } from "@/lib/domain/finance";
import { isOpenStatus, PHASES, PHASE_LABELS, DATE_ANCHOR_LABELS, type Phase } from "@/lib/domain/labels";
import type { Task } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { HealthBadge } from "@/components/status";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ActionButton } from "@/components/action-button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { HEALTHS, HEALTH_LABELS, PRIORITIES, PRIORITY_LABELS } from "@/lib/domain/labels";
import { addContact, applyPlanProposal, removeContact, setPhase, updateProjectDetails } from "./_actions/project";
import { NextActionForm } from "./next-action-form";

export default async function ProjectOverview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nieuw?: string }> }) {
  const { id } = await params;
  const { nieuw } = await searchParams;
  const { s, project, client } = await getProject(id);
  const db = s.supabase;
  const today = todayISO();
  const owner = s.role === "owner";

  const [{ data: tasks }, { data: days }, { data: deliverables }, { data: proposal }, refs, { data: contacts }, { data: quote }, { data: template }] = await Promise.all([
    db.from("tasks").select("id, title, status, phase, optional, due_date, assignee_id, waiting_since, blocked_reason, priority, sort").eq("project_id", id).order("sort"),
    db.from("shoot_days").select("id, shoot_date, booking_shoot_days(bookings(status))").eq("project_id", id).order("shoot_date"),
    db.from("deliverables").select("id, name, approved_version_id, deliverable_links(id, is_final)").eq("project_id", id),
    db.rpc("plan_proposal", { p_project: id }),
    lookups(db),
    db.from("project_contacts").select("contacts(id, name, role, email, phone)").eq("project_id", id),
    db.from("integration_quotes").select("source, external_id, status").eq("project_id", id).maybeSingle(),
    project.template_version_id
      ? db.from("template_versions").select("version, templates(name)").eq("id", project.template_version_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const allTasks = (tasks ?? []) as Pick<Task, "id" | "title" | "status" | "phase" | "optional" | "due_date" | "assignee_id" | "waiting_since" | "blocked_reason" | "priority" | "sort">[];
  const shootDays = (days ?? []).map((d) => ({
    shoot_date: d.shoot_date as string,
    booking_statuses: ((d.booking_shoot_days as unknown as { bookings: { status: string } | null }[]) ?? []).map((b) => b.bookings?.status).filter((x): x is string => !!x && x !== "geannuleerd"),
  }));
  const attention = computeAttention(project, allTasks, shootDays, today);
  const openTasks = allTasks.filter((t) => isOpenStatus(t.status));
  const nextTask = project.next_action_task_id ? allTasks.find((t) => t.id === project.next_action_task_id) : null;
  const staffNames = new Map(refs.staff.map((p) => [p.id, p.full_name]));

  // Fasevoorstel: alle relevante taken van de huidige fase klaar of n.v.t.
  const phaseIdx = PHASES.indexOf(project.phase);
  const currentPhaseTasks = allTasks.filter((t) => t.phase === project.phase && !t.optional);
  const suggestNext: Phase | null =
    phaseIdx < 7 && currentPhaseTasks.length > 0 && currentPhaseTasks.every((t) => !isOpenStatus(t.status)) ? PHASES[phaseIdx + 1] : null;

  // Afrondingscheck (financieel deel alleen voor de eigenaar)
  let finance: Parameters<typeof closureIssues>[0]["finance"];
  if (owner) {
    const fin = db.schema("finance");
    const [{ data: pf }, { data: costs }, { data: extra }, { data: invoices }, { data: followups }] = await Promise.all([
      fin.from("project_finances").select("quote_amount_cents").eq("project_id", id).maybeSingle(),
      fin.from("costs").select("kind, amount_cents").eq("project_id", id),
      fin.from("extra_work").select("amount_cents, status").eq("project_id", id),
      fin.from("invoices").select("id, amount_excl_cents, vat_cents, status, due_on").eq("project_id", id),
      fin.from("followups").select("id").eq("project_id", id).is("done_at", null),
    ]);
    const invIds = (invoices ?? []).map((i) => i.id);
    const { data: payments } = invIds.length ? await fin.from("payments").select("invoice_id, amount_cents").in("invoice_id", invIds) : { data: [] };
    const sum = summarizeFinance({ quote_amount_cents: pf?.quote_amount_cents ?? null, costs: costs ?? [], extra_work: extra ?? [], invoices: invoices ?? [], payments: payments ?? [] }, today);
    finance = { outstanding_cents: sum.outstanding_cents, revenue_known: sum.revenue_cents !== null, actual_costs_known: sum.actual_costs_cents !== null, open_followups: followups?.length ?? 0 };
  }
  const issues = closureIssues({
    deliverables: (deliverables ?? []).map((d) => ({
      name: d.name as string,
      approved: !!d.approved_version_id,
      final_link_count: ((d.deliverable_links as { is_final: boolean }[]) ?? []).filter((l) => l.is_final).length,
    })),
    tasks: allTasks,
    finance,
  });
  const showClosure = ["oplevering", "afronding", "evaluatie", "afgerond"].includes(project.phase);
  const linkedContacts = (contacts ?? []).map((c) => c.contacts as unknown as { id: string; name: string; role: string; email: string | null; phone: string | null }).filter(Boolean);
  const { data: clientContacts } = project.client_id ? await db.from("contacts").select("id, name").eq("client_id", project.client_id) : { data: [] };
  const tpl = template as unknown as { version: number; templates: { name: string } | null } | null;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="flex min-w-0 flex-col gap-5">
        {nieuw && (
          <Alert tone="ok" title="Project aangemaakt">
            {allTasks.length} taken aangemaakt vanuit {tpl?.templates?.name ?? "de template"} (versie {tpl?.version}). Kies hieronder de eerstvolgende actie.
          </Alert>
        )}

        <Card id="volgende-actie" className={project.next_action_needs_update || (!project.next_action_task_id && !project.next_action_text) ? "border-amber-400" : ""}>
          <CardHeader title="Eerstvolgende actie" description="Kies bewust wat nu het belangrijkst is. Dit wordt niet automatisch bepaald." />
          <CardBody className="flex flex-col gap-4">
            {project.next_action_needs_update && (
              <Alert tone="warn" title="De volgende actie is afgerond">
                Kies een nieuwe eerstvolgende actie voor dit project.
              </Alert>
            )}
            {nextTask || project.next_action_text ? (
              <div>
                <p className="font-heading text-lg font-bold">
                  {nextTask ? (
                    <Link href={`/projecten/${id}/taken/${nextTask.id}`} className="hover:underline">
                      {nextTask.title}
                    </Link>
                  ) : (
                    project.next_action_text
                  )}
                </p>
                <p className="text-sm text-zinc-600">
                  {staffNames.get(project.next_action_assignee_id ?? nextTask?.assignee_id ?? project.lead_id ?? "") ?? "Niemand toegewezen"}
                  {project.next_action_date && (
                    <span className={project.next_action_date < today ? "font-semibold text-red-800" : ""}> · {relativeDay(project.next_action_date, today)} ({formatDate(project.next_action_date)})</span>
                  )}
                  {nextTask && !isOpenStatus(nextTask.status) && " · taak is afgerond"}
                </p>
              </div>
            ) : (
              !project.next_action_needs_update && <p className="font-semibold text-amber-800">Er is nog geen eerstvolgende actie gekozen.</p>
            )}
            <NextActionForm
              projectId={id}
              tasks={openTasks.map((t) => ({ id: t.id, title: t.title, phase: t.phase, due_date: t.due_date }))}
              staff={refs.staff.map((p) => ({ id: p.id, name: p.full_name }))}
              current={{ taskId: nextTask && isOpenStatus(nextTask.status) ? nextTask.id : null, text: project.next_action_text, assignee: project.next_action_assignee_id, date: project.next_action_date }}
            />
          </CardBody>
        </Card>

        {suggestNext && project.phase !== "afgerond" && (
          <Alert tone="info" title={`Alle taken in ${PHASE_LABELS[project.phase]} zijn afgerond`}>
            <ActionForm action={setPhase.bind(null, id)} success="Fase gewijzigd" className="mt-2 flex flex-wrap items-center gap-2">
              <input type="hidden" name="phase" value={suggestNext} />
              <span>Voorstel: fase wijzigen naar {PHASE_LABELS[suggestNext]}.</span>
              <SubmitButton size="sm" variant="dark">
                Wijzig naar {PHASE_LABELS[suggestNext]}
              </SubmitButton>
            </ActionForm>
          </Alert>
        )}

        {(proposal ?? []).length > 0 && (
          <Card className="border-sky-300">
            <CardHeader title="Planningsvoorstel" description="Een referentiedatum (deadline of draaidag) is gewijzigd. Kies welke taakdatums je wilt bijwerken." />
            <CardBody>
              <ActionForm action={applyPlanProposal.bind(null, id)} success="Planning bijgewerkt">
                <ul className="mb-3 divide-y divide-zinc-100 text-sm">
                  {(proposal as { task_id: string; title: string; current_due: string | null; proposed_due: string | null; anchor: keyof typeof DATE_ANCHOR_LABELS }[]).map((p) => (
                    <li key={p.task_id} className="flex items-start gap-2 py-2">
                      <input type="checkbox" name="task_id" value={p.task_id} defaultChecked id={`pp-${p.task_id}`} className="mt-1 size-4 accent-ink" />
                      <label htmlFor={`pp-${p.task_id}`} className="flex-1">
                        <span className="font-semibold">{p.title}</span>
                        <span className="block text-xs text-zinc-600">
                          {formatDate(p.current_due) === "—" ? "ongepland" : formatDate(p.current_due)} → {p.proposed_due ? formatDate(p.proposed_due, { weekday: true }) : "ongepland (referentiedatum ontbreekt)"} · t.o.v. {DATE_ANCHOR_LABELS[p.anchor].toLowerCase()}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <SubmitButton size="sm">Geselecteerde datums bijwerken</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        )}

        {showClosure && (
          <Card id="afrondingscheck">
            <CardHeader title="Afrondingscheck" description={owner ? "Deliverables, akkoord, relevante taken en financiële afhandeling." : "Deliverables, akkoord en relevante taken."} />
            <CardBody>
              {issues.length === 0 ? (
                <p className="text-sm font-semibold text-green-800">Alles is afgehandeld. Het project kan worden afgerond.</p>
              ) : (
                <ul className="list-inside list-disc text-sm">
                  {issues.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title="Projectgegevens" description="Briefing, doel, strategie en concept. Interne velden zijn niet zichtbaar voor klanten." />
          <CardBody>
            <ActionForm action={updateProjectDetails.bind(null, id)} className="grid gap-4 sm:grid-cols-2">
              <Field label="Projectnaam" htmlFor="d-name" required className="sm:col-span-2">
                <Input id="d-name" name="name" defaultValue={project.name} required maxLength={200} />
              </Field>
              <Field label="Klant" htmlFor="d-client">
                <Select id="d-client" name="client_id" defaultValue={project.client_id ?? ""}>
                  <option value="">Geen klant</option>
                  {refs.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Merk" htmlFor="d-brand">
                <Select id="d-brand" name="brand_id" defaultValue={project.brand_id}>
                  {refs.brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Projectverantwoordelijke" htmlFor="d-lead">
                <Select id="d-lead" name="lead_id" defaultValue={project.lead_id ?? ""}>
                  <option value="">—</option>
                  {refs.staff.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Projecttype" htmlFor="d-type">
                <Input id="d-type" name="project_type" defaultValue={project.project_type} maxLength={100} />
              </Field>
              <Field label="Prioriteit" htmlFor="d-prio">
                <Select id="d-prio" name="priority" defaultValue={project.priority}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Startdatum" htmlFor="d-start">
                <Input id="d-start" name="start_date" type="date" defaultValue={project.start_date ?? ""} />
              </Field>
              <Field label="Projectdeadline" htmlFor="d-deadline">
                <Input id="d-deadline" name="deadline" type="date" defaultValue={project.deadline ?? ""} />
              </Field>
              <Field label="Opvolgdatum" htmlFor="d-follow" hint="Wanneer moet dit project weer bekeken worden?">
                <Input id="d-follow" name="follow_up_date" type="date" defaultValue={project.follow_up_date ?? ""} />
              </Field>
              <Field label="Projectgezondheid (handmatig)" htmlFor="d-health" hint="Naast de automatische signalen. Op schema = geen handmatige melding.">
                <Select id="d-health" name="health" defaultValue={project.health}>
                  {HEALTHS.map((h) => (
                    <option key={h} value={h}>
                      {HEALTH_LABELS[h]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Toelichting gezondheid" htmlFor="d-hnote" className="sm:col-span-2">
                <Input id="d-hnote" name="health_note" defaultValue={project.health_note} maxLength={500} />
              </Field>
              {(
                [
                  ["briefing", "Korte briefing", project.briefing],
                  ["goal", "Doel", project.goal],
                  ["target_audience", "Doelgroep", project.target_audience],
                  ["strategy", "Strategie", project.strategy],
                  ["concept", "Concept", project.concept],
                ] as const
              ).map(([name, label, value]) => (
                <Field key={name} label={label} htmlFor={`d-${name}`} className="sm:col-span-2">
                  <Textarea id={`d-${name}`} name={name} defaultValue={value} maxLength={5000} />
                </Field>
              ))}
              <Field label="Crewbriefing (gedeeld met geboekte freelancers met account)" htmlFor="d-crew" className="sm:col-span-2" hint="Alleen deze tekst is zichtbaar voor crew; de interne briefing niet.">
                <Textarea id="d-crew" name="crew_briefing" defaultValue={project.crew_briefing} maxLength={5000} />
              </Field>
              <div className="sm:col-span-2">
                <SubmitButton>Opslaan</SubmitButton>
              </div>
            </ActionForm>
          </CardBody>
        </Card>
      </div>

      <aside className="flex flex-col gap-5">
        <Card>
          <CardHeader title="Status" />
          <CardBody className="flex flex-col gap-2 text-sm">
            <HealthBadge level={attention.level} />
            {attention.reasons.length === 0 ? (
              <p className="text-zinc-600">Geen signalen. Het project loopt volgens plan.</p>
            ) : (
              <ul className="list-inside list-disc">
                {attention.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            {attention.notes.length > 0 && (
              <ul className="text-xs text-zinc-600">
                {attention.notes.map((n) => (
                  <li key={n}>Info: {n}</li>
                ))}
              </ul>
            )}
            <p className="text-xs text-zinc-500">
              {openTasks.length} open taken · {allTasks.filter((t) => t.due_date === null && isOpenStatus(t.status)).length} zonder datum
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Contacten" description={client ? `Klant: ${client.name}` : undefined} />
          <CardBody className="flex flex-col gap-3 text-sm">
            {linkedContacts.length === 0 ? (
              <p className="text-zinc-600">Nog geen contactpersonen gekoppeld.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {linkedContacts.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-2 py-2">
                    <div>
                      <p className="font-semibold">{c.name}</p>
                      <p className="text-xs text-zinc-600">{[c.role, c.email, c.phone].filter(Boolean).join(" · ")}</p>
                    </div>
                    <ActionButton size="sm" variant="ghost" action={removeContact.bind(null, id, c.id)} confirm="Contact ontkoppelen van dit project?">
                      Ontkoppel
                    </ActionButton>
                  </li>
                ))}
              </ul>
            )}
            <details>
              <summary className="cursor-pointer font-semibold">Contact toevoegen</summary>
              <ActionForm action={addContact.bind(null, id)} resetOnSuccess className="mt-3 flex flex-col gap-3">
                {(clientContacts ?? []).length > 0 && (
                  <Field label="Bestaand contact" htmlFor="c-existing">
                    <Select id="c-existing" name="contact_id" defaultValue="">
                      <option value="">Nieuw contact</option>
                      {(clientContacts ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                <Field label="Naam (nieuw contact)" htmlFor="c-name">
                  <Input id="c-name" name="name" maxLength={200} />
                </Field>
                <Field label="Rol" htmlFor="c-role">
                  <Input id="c-role" name="role" maxLength={100} />
                </Field>
                <Field label="E-mail" htmlFor="c-email">
                  <Input id="c-email" name="email" type="email" />
                </Field>
                <Field label="Telefoon" htmlFor="c-phone">
                  <Input id="c-phone" name="phone" maxLength={40} />
                </Field>
                <SubmitButton size="sm">Koppelen</SubmitButton>
              </ActionForm>
            </details>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Herkomst" />
          <CardBody className="text-sm text-zinc-700">
            <p>
              Template: {tpl?.templates?.name ?? "—"} {tpl && `(versie ${tpl.version}, vaste kopie)`}
            </p>
            {quote && (
              <p className="mt-1">
                Offerte: {quote.source} · {quote.external_id} · {quote.status === "accepted" ? "akkoord" : "aangemaakt"}
              </p>
            )}
            <p className="mt-1">Aangemaakt: {formatDate(project.created_at.slice(0, 10), { year: true })}</p>
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}
