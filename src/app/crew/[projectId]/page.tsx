import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download, ExternalLink } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { formatDate, formatDateTime, formatTime } from "@/lib/domain/dates";
import { CREW_TASK_STATUSES, TASK_STATUS_LABELS, type TaskStatus } from "@/lib/domain/labels";
import type { ChecklistItem } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { BookingBadge, TaskStatusBadge } from "@/components/status";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Checkbox, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { crewComment, crewUpdateTask } from "../actions";
import type { BookingStatus } from "@/lib/domain/labels";

type CrewProject = {
  name: string;
  client_name: string | null;
  crew_briefing: string;
  bookings: { id: string; role: string; work_description: string; status: BookingStatus }[];
  shoot_days: { id: string; shoot_date: string; start_time: string | null; end_time: string | null; location: string; address: string; schedule: string; callsheet_url: string | null; crew_notes: string; crew: { name: string; role: string }[] }[];
  tasks: { id: string; title: string; description: string; checklist: ChecklistItem[]; status: TaskStatus; due_date: string | null; comments: { body: string; created_at: string; author: string }[] }[];
  documents: { id: string; title: string; kind: string; url: string | null; file_name: string | null }[];
};

export default async function CrewProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const s = await requireRole("freelancer");
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) notFound();
  const { data, error } = await s.supabase.rpc("crew_project", { p_project: projectId });
  if (error || !data) notFound();
  const p = data as CrewProject;
  return (
    <>
      <Link href="/crew" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-ink">
        <ChevronLeft className="size-4" aria-hidden /> Mijn projecten
      </Link>
      <h1>{p.name}</h1>
      <p className="mb-5 text-sm text-zinc-600">{p.client_name}</p>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Jouw boeking" />
            <CardBody className="flex flex-col gap-2 text-sm">
              {p.bookings.map((b) => (
                <div key={b.id}>
                  <p className="flex items-center gap-2 font-semibold">
                    {b.role || "Crew"} <BookingBadge status={b.status} />
                  </p>
                  {b.work_description && <p className="whitespace-pre-wrap">{b.work_description}</p>}
                </div>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Briefing" />
            <CardBody className="whitespace-pre-wrap text-sm">{p.crew_briefing || "Nog geen briefing gedeeld."}</CardBody>
          </Card>
          {p.shoot_days.map((d) => (
            <Card key={d.id}>
              <CardHeader
                title={`Draaidag ${formatDate(d.shoot_date, { weekday: true, year: true })}`}
                description={[d.start_time && `${formatTime(d.start_time)}–${formatTime(d.end_time)}`, d.location, d.address].filter(Boolean).join(" · ")}
              />
              <CardBody className="flex flex-col gap-2 text-sm">
                {d.callsheet_url && (
                  <a href={d.callsheet_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold underline">
                    Callsheet <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                )}
                {d.schedule && <p className="whitespace-pre-wrap">{d.schedule}</p>}
                {d.crew_notes && <p className="whitespace-pre-wrap rounded bg-brand-soft p-2">{d.crew_notes}</p>}
                {d.crew.length > 0 && (
                  <p className="text-zinc-600">
                    Crew: {d.crew.map((c) => `${c.name}${c.role ? ` (${c.role})` : ""}`).join(", ")}
                  </p>
                )}
              </CardBody>
            </Card>
          ))}
          {p.documents.length > 0 && (
            <Card>
              <CardHeader title="Gedeelde documenten en links" />
              <CardBody>
                <ul className="flex flex-col gap-1 text-sm">
                  {p.documents.map((d) => (
                    <li key={d.id}>
                      {d.kind === "link" ? (
                        <a href={d.url!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold underline">
                          {d.title} <ExternalLink className="size-3.5" aria-hidden />
                        </a>
                      ) : (
                        <a href={`/api/documenten/${d.id}`} className="inline-flex items-center gap-1 font-semibold underline">
                          {d.title} <Download className="size-3.5" aria-hidden />
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
        <section aria-labelledby="crew-taken" className="flex flex-col gap-4">
          <h2 id="crew-taken">Gedeelde taken</h2>
          {p.tasks.length === 0 && <EmptyState title="Geen gedeelde taken" />}
          {p.tasks.map((t) => (
            <Card key={t.id}>
              <CardHeader as="h3" title={t.title} description={t.due_date ? `Deadline ${formatDate(t.due_date, { weekday: true })}` : undefined} action={<TaskStatusBadge status={t.status} />} />
              <CardBody className="flex flex-col gap-3 text-sm">
                {t.description && <p className="whitespace-pre-wrap">{t.description}</p>}
                <ActionForm action={crewUpdateTask.bind(null, projectId, t.id)} success="Bijgewerkt" className="flex flex-col gap-2">
                  {t.checklist.map((c) => (
                    <label key={c.id} className="flex items-center gap-2">
                      <input type="hidden" name="item_ids" value={c.id} />
                      <Checkbox name="done" value={c.id} defaultChecked={c.done} /> {c.text}
                    </label>
                  ))}
                  <div className="flex flex-wrap items-end gap-2">
                    <Field label="Status" htmlFor={`cs-${t.id}`}>
                      <Select id={`cs-${t.id}`} name="status" defaultValue={CREW_TASK_STATUSES.includes(t.status) ? t.status : "bezig"} className="w-56">
                        {CREW_TASK_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {TASK_STATUS_LABELS[st]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <SubmitButton size="sm">Opslaan</SubmitButton>
                  </div>
                </ActionForm>
                {t.comments.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {t.comments.map((c, i) => (
                      <li key={i} className="rounded bg-zinc-50 p-2">
                        <p className="whitespace-pre-wrap">{c.body}</p>
                        <p className="text-xs text-zinc-500">
                          {c.author} · {formatDateTime(c.created_at)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                <ActionForm action={crewComment.bind(null, projectId, t.id)} success="Opmerking geplaatst" resetOnSuccess className="flex flex-col gap-2">
                  <Field label="Opmerking voor Studio Brutaal" htmlFor={`cc-${t.id}`}>
                    <Textarea id={`cc-${t.id}`} name="body" required maxLength={4000} />
                  </Field>
                  <div>
                    <SubmitButton size="sm" variant="outline">
                      Plaatsen
                    </SubmitButton>
                  </div>
                </ActionForm>
              </CardBody>
            </Card>
          ))}
        </section>
      </div>
    </>
  );
}
