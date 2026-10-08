import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getProject } from "@/lib/data/project";
import { allProfiles, lookups } from "@/lib/data/overview";
import { dateOfInstant, formatDate, formatDateTime, todayISO, workdaysBetween } from "@/lib/domain/dates";
import { isOpenStatus, PHASE_LABELS } from "@/lib/domain/labels";
import type { Task } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { TaskStatusBadge } from "@/components/status";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ActionButton } from "@/components/action-button";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Textarea } from "@/components/ui/input";
import { TaskForm } from "./task-form";
import { addComment, createTask, deleteTask } from "../../_actions/tasks";

export default async function TaskPage({ params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params;
  const { s } = await getProject(id);
  const db = s.supabase;
  const { data } = await db.from("tasks").select("*").eq("id", taskId).eq("project_id", id).maybeSingle();
  if (!data) notFound();
  const task = data as Task;
  const today = todayISO();
  const [refs, names, { data: freelancers }, { data: days }, { data: deliverables }, { data: others }, { data: deps }, { data: comments }] = await Promise.all([
    lookups(db),
    allProfiles(db),
    db.from("freelancers").select("id, name, user_id").eq("active", true).order("name"),
    db.from("shoot_days").select("id, shoot_date").eq("project_id", id).order("shoot_date"),
    db.from("deliverables").select("id, name").eq("project_id", id).order("sort"),
    db.from("tasks").select("id, title, phase, status, parent_task_id").eq("project_id", id).order("sort"),
    db.from("task_dependencies").select("depends_on_task_id").eq("task_id", taskId),
    db.from("task_comments").select("id, body, author_id, visible_to_crew, created_at").eq("task_id", taskId).order("created_at"),
  ]);
  const allTasks = (others ?? []) as Pick<Task, "id" | "title" | "phase" | "status" | "parent_task_id">[];
  const depIds = (deps ?? []).map((d) => d.depends_on_task_id as string);
  const openDeps = allTasks.filter((t) => depIds.includes(t.id) && isOpenStatus(t.status));
  const subs = allTasks.filter((t) => t.parent_task_id === taskId);
  const parent = task.parent_task_id ? allTasks.find((t) => t.id === task.parent_task_id) : null;
  const linkedFreelancer = (freelancers ?? []).find((f) => f.id === task.freelancer_id);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-5">
        <Link href={`/projecten/${id}/taken`} className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-ink">
          <ChevronLeft className="size-4" aria-hidden /> Alle taken
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl">{task.title}</h2>
          <TaskStatusBadge status={task.status} />
          <Badge>{PHASE_LABELS[task.phase]}</Badge>
          {task.optional && <Badge>Optioneel</Badge>}
        </div>
        {parent && (
          <p className="text-sm">
            Subtaak van{" "}
            <Link className="font-semibold underline" href={`/projecten/${id}/taken/${parent.id}`}>
              {parent.title}
            </Link>
          </p>
        )}
        {task.waiting_since && (
          <Alert tone="warn">
            Wacht sinds {formatDate(dateOfInstant(task.waiting_since), { year: true })} ({workdaysBetween(dateOfInstant(task.waiting_since), today)} werkdagen).
            {task.follow_up_date ? ` Opvolgen op ${formatDate(task.follow_up_date)}.` : " Tip: zet een opvolgdatum."}
          </Alert>
        )}
        {openDeps.length > 0 && (
          <Alert tone="info" title="Wacht op andere taken">
            {openDeps.map((d) => d.title).join(", ")}
          </Alert>
        )}
        {task.freelancer_id && !linkedFreelancer?.user_id && (
          <p className="text-sm text-zinc-600">Freelancer {linkedFreelancer?.name ?? ""} heeft geen account; de interne verantwoordelijke houdt de voortgang bij.</p>
        )}
        <Card>
          <CardBody>
            <TaskForm
              task={task}
              staff={refs.staff.map((p) => ({ id: p.id, label: p.full_name }))}
              freelancers={(freelancers ?? []).map((f) => ({ id: f.id, label: f.name + (f.user_id ? " (account)" : "") }))}
              shootDays={(days ?? []).map((d) => ({ id: d.id, label: formatDate(d.shoot_date, { weekday: true, year: true }) }))}
              deliverables={(deliverables ?? []).map((d) => ({ id: d.id, label: d.name }))}
              otherTasks={allTasks.filter((t) => t.id !== taskId).map((t) => ({ id: t.id, label: `${PHASE_LABELS[t.phase]} — ${t.title}` }))}
              dependsOn={depIds}
            />
          </CardBody>
        </Card>
      </div>

      <aside className="flex flex-col gap-5">
        <Card>
          <CardHeader title="Subtaken" />
          <CardBody className="flex flex-col gap-3 text-sm">
            {subs.length === 0 ? (
              <p className="text-zinc-600">Geen subtaken.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {subs.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 py-1.5">
                    <Link href={`/projecten/${id}/taken/${t.id}`} className="font-semibold hover:underline">
                      {t.title}
                    </Link>
                    <TaskStatusBadge status={t.status} />
                  </li>
                ))}
              </ul>
            )}
            <ActionForm action={createTask.bind(null, id)} success="Subtaak toegevoegd" resetOnSuccess className="flex gap-2">
              <input type="hidden" name="phase" value={task.phase} />
              <input type="hidden" name="parent_task_id" value={task.id} />
              <input type="hidden" name="assignee_id" value={task.assignee_id ?? ""} />
              <label htmlFor="sub-title" className="sr-only">
                Nieuwe subtaak
              </label>
              <Input id="sub-title" name="title" placeholder="Nieuwe subtaak" required maxLength={300} />
              <SubmitButton size="sm" variant="outline">
                Voeg toe
              </SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Opmerkingen" />
          <CardBody className="flex flex-col gap-3 text-sm">
            {(comments ?? []).length === 0 && <p className="text-zinc-600">Nog geen opmerkingen.</p>}
            <ul className="flex flex-col gap-3">
              {(comments ?? []).map((c) => (
                <li key={c.id} className="rounded-md bg-zinc-50 p-2">
                  <p className="whitespace-pre-wrap">{c.body}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {names.get(c.author_id ?? "") ?? "Onbekend"} · {formatDateTime(c.created_at)}
                    {c.visible_to_crew && " · zichtbaar voor crew"}
                  </p>
                </li>
              ))}
            </ul>
            <ActionForm action={addComment.bind(null, id, taskId)} success="Opmerking geplaatst" resetOnSuccess className="flex flex-col gap-2">
              <Field label="Nieuwe opmerking" htmlFor="cm-body">
                <Textarea id="cm-body" name="body" required maxLength={4000} />
              </Field>
              {task.shared_with_freelancer && (
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox name="visible_to_crew" /> Zichtbaar voor de gekoppelde freelancer
                </label>
              )}
              <SubmitButton size="sm">Plaatsen</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>

        <ActionButton variant="outline" className="text-red-800" action={deleteTask.bind(null, id, taskId)} confirm={`Taak "${task.title}" definitief verwijderen? Dit kan niet ongedaan worden gemaakt. Overweeg 'Niet van toepassing'.`}>
          Taak verwijderen
        </ActionButton>
      </aside>
    </div>
  );
}
