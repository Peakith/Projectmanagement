import Link from "next/link";
import { getProject } from "@/lib/data/project";
import { allProfiles, lookups } from "@/lib/data/overview";
import { dateOfInstant, formatDate, todayISO, workdaysBetween } from "@/lib/domain/dates";
import { isOpenStatus, PHASES, PHASE_LABELS, PRIORITIES, PRIORITY_LABELS } from "@/lib/domain/labels";
import type { Task } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PriorityBadge } from "@/components/status";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { QuickStatus } from "../quick-status";
import { createTask, phaseNotApplicable } from "../_actions/tasks";

export default async function TasksPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ toon?: string }> }) {
  const { id } = await params;
  const { toon } = await searchParams;
  const { s, project } = await getProject(id);
  const today = todayISO();
  const [{ data }, names, refs, { data: freelancers }, { data: days }] = await Promise.all([
    s.supabase.from("tasks").select("*").eq("project_id", id).order("sort"),
    allProfiles(s.supabase),
    lookups(s.supabase),
    s.supabase.from("freelancers").select("id, name"),
    s.supabase.from("shoot_days").select("id, shoot_date").eq("project_id", id),
  ]);
  const tasks = (data ?? []) as Task[];
  const fNames = new Map((freelancers ?? []).map((f) => [f.id, f.name]));
  const dayDates = new Map((days ?? []).map((d) => [d.id, d.shoot_date as string]));
  const showAll = toon === "alles";
  const topLevel = tasks.filter((t) => !t.parent_task_id);
  const subtasks = (parent: string) => tasks.filter((t) => t.parent_task_id === parent);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-600">
          {tasks.filter((t) => isOpenStatus(t.status)).length} open · {tasks.filter((t) => t.status === "klaar").length} klaar · {tasks.filter((t) => t.status === "nvt").length} n.v.t.
        </p>
        <div className="flex gap-2 text-sm font-semibold">
          <Link href="?toon=open" aria-current={!showAll ? "true" : undefined} className={!showAll ? "underline decoration-brand decoration-2" : ""}>
            Open taken
          </Link>
          <Link href="?toon=alles" aria-current={showAll ? "true" : undefined} className={showAll ? "underline decoration-brand decoration-2" : ""}>
            Alle taken
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader title="Taak toevoegen" as="h2" />
        <CardBody>
          <ActionForm action={createTask.bind(null, id)} success="Taak toegevoegd" resetOnSuccess className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Field label="Titel" htmlFor="nt-title" required className="lg:col-span-2">
              <Input id="nt-title" name="title" required maxLength={300} />
            </Field>
            <Field label="Fase" htmlFor="nt-phase">
              <Select id="nt-phase" name="phase" defaultValue={project.phase === "afgerond" || project.phase === "verloren" ? "deal" : project.phase}>
                {PHASES.slice(0, 8).map((p) => (
                  <option key={p} value={p}>
                    {PHASE_LABELS[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Verantwoordelijke" htmlFor="nt-who">
              <Select id="nt-who" name="assignee_id" defaultValue={s.userId}>
                <option value="">—</option>
                {refs.staff.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Deadline" htmlFor="nt-due">
              <Input id="nt-due" name="due_date" type="date" />
            </Field>
            <Field label="Prioriteit" htmlFor="nt-prio">
              <Select id="nt-prio" name="priority" defaultValue="normaal">
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="lg:col-span-6">
              <SubmitButton size="sm">Toevoegen</SubmitButton>
            </div>
          </ActionForm>
        </CardBody>
      </Card>

      {PHASES.filter((p) => topLevel.some((t) => t.phase === p)).map((phase) => {
        const inPhase = topLevel.filter((t) => t.phase === phase);
        const visible = showAll ? inPhase : inPhase.filter((t) => isOpenStatus(t.status));
        const open = inPhase.filter((t) => isOpenStatus(t.status)).length;
        return (
          <Card key={phase} id={`fase-${phase}`}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  {PHASE_LABELS[phase]}
                  {phase === project.phase && <Badge tone="brand">Huidige fase</Badge>}
                </span>
              }
              description={`${inPhase.length - open} van ${inPhase.length} afgehandeld`}
              action={
                open > 0 ? (
                  <details className="text-sm">
                    <summary className="cursor-pointer font-semibold">Fase niet van toepassing…</summary>
                    <ActionForm action={phaseNotApplicable.bind(null, id)} className="mt-2 flex flex-wrap items-end gap-2" confirm={`Alle ${open} open taken in ${PHASE_LABELS[phase]} op 'Niet van toepassing' zetten?`}>
                      <input type="hidden" name="phase" value={phase} />
                      <label htmlFor={`nvt-${phase}`} className="sr-only">
                        Reden
                      </label>
                      <Input id={`nvt-${phase}`} name="reason" placeholder="Reden, bijv. kleine opdracht" required className="h-8 w-56 text-xs" />
                      <SubmitButton size="sm" variant="outline">
                        Toepassen
                      </SubmitButton>
                    </ActionForm>
                  </details>
                ) : null
              }
            />
            {visible.length === 0 ? (
              <p className="px-4 py-3 text-sm text-zinc-500">Alle taken in deze fase zijn afgehandeld.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {visible.map((t) => (
                  <TaskRow key={t.id} t={t} projectId={id} today={today} names={names} fNames={fNames} dayDates={dayDates} subs={subtasks(t.id)} />
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function TaskRow({
  t,
  projectId,
  today,
  names,
  fNames,
  dayDates,
  subs,
}: {
  t: Task;
  projectId: string;
  today: string;
  names: Map<string, string>;
  fNames: Map<string, string>;
  dayDates: Map<string, string>;
  subs: Task[];
}) {
  const open = isOpenStatus(t.status);
  const late = open && t.due_date && t.due_date < today;
  const unplanned = open && !t.due_date && t.anchor !== "none";
  const doneChecks = t.checklist.filter((c) => c.done).length;
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start">
      <QuickStatus projectId={projectId} taskId={t.id} status={t.status} label={t.title} />
      <div className="min-w-0 flex-1">
        <Link href={`/projecten/${projectId}/taken/${t.id}`} className={`font-semibold hover:underline ${!open ? "text-zinc-500 line-through" : ""}`}>
          {t.title}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-600">
          <span>{names.get(t.assignee_id ?? "") ?? "Niet toegewezen"}</span>
          {t.due_date && <span className={late ? "font-semibold text-red-800" : ""}>· {late ? "te laat: " : ""}{formatDate(t.due_date, { weekday: true })}</span>}
          {unplanned && <Badge tone="warn">Ongepland — referentiedatum ontbreekt</Badge>}
          <PriorityBadge priority={t.priority} />
          {t.optional && <Badge>Optioneel</Badge>}
          {t.freelancer_id && <Badge tone="info">Freelancer: {fNames.get(t.freelancer_id)}{t.shared_with_freelancer ? " (gedeeld)" : ""}</Badge>}
          {t.shoot_day_id && <Badge>Draaidag {formatDate(dayDates.get(t.shoot_day_id))}</Badge>}
          {t.checklist.length > 0 && <span>· checklist {doneChecks}/{t.checklist.length}</span>}
          {t.waiting_since && <span className="font-semibold text-amber-800">· wacht sinds {workdaysBetween(dateOfInstant(t.waiting_since), today)} werkdagen</span>}
          {t.follow_up_date && open && <span>· opvolgen {formatDate(t.follow_up_date)}</span>}
          {t.blocked_reason && <span className="font-semibold text-red-800">· {t.blocked_reason}</span>}
          {t.nvt_reason && <span>· n.v.t.: {t.nvt_reason}</span>}
          {subs.length > 0 && <span>· {subs.filter((x) => !isOpenStatus(x.status)).length}/{subs.length} subtaken</span>}
        </div>
      </div>
    </li>
  );
}
