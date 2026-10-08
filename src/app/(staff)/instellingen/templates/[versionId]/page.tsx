import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireOwner } from "@/lib/auth";
import { DATE_ANCHOR_LABELS, PHASES, PHASE_LABELS, PRIORITIES, PRIORITY_LABELS, type DateAnchor, type Phase, type Priority } from "@/lib/domain/labels";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/action-button";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { deleteDraftVersion, deleteTemplateTask, publishVersion, saveTemplateTask } from "../actions";

type TT = { id: string; phase: Phase; sort: number; title: string; description: string; checklist: string[]; anchor: DateAnchor; offset_days: number; priority: Priority; optional: boolean; per_shoot_day: boolean };

export default async function VersionPage({ params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const s = await requireOwner();
  if (!/^[0-9a-f-]{36}$/i.test(versionId)) notFound();
  const { data: v } = await s.supabase.from("template_versions").select("id, version, published_at, templates(name)").eq("id", versionId).maybeSingle();
  if (!v) notFound();
  const { data: tasks } = await s.supabase.from("template_tasks").select("*").eq("template_version_id", versionId).order("sort");
  const editable = !v.published_at;
  const list = (tasks ?? []) as TT[];
  return (
    <>
      <Link href="/instellingen/templates" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-ink">
        <ChevronLeft className="size-4" aria-hidden /> Templates
      </Link>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1>
          {(v.templates as unknown as { name: string }).name} · versie {v.version} {editable ? <Badge tone="warn">Concept</Badge> : <Badge tone="ok">Gepubliceerd</Badge>}
        </h1>
        {editable && (
          <div className="flex gap-2">
            <ActionButton action={publishVersion.bind(null, versionId)} confirm="Versie publiceren? Daarna is deze niet meer te wijzigen.">
              Publiceren
            </ActionButton>
            <ActionButton variant="outline" action={deleteDraftVersion.bind(null, versionId)} confirm="Conceptversie verwijderen?">
              Concept verwijderen
            </ActionButton>
          </div>
        )}
      </div>
      {!editable && (
        <div className="mb-4">
          <Alert tone="info">Gepubliceerde versies zijn alleen-lezen. Maak een nieuwe versie om aanpassingen te doen.</Alert>
        </div>
      )}
      <div className="flex flex-col gap-5">
        {PHASES.slice(0, 8).map((phase) => {
          const inPhase = list.filter((t) => t.phase === phase);
          return (
            <Card key={phase}>
              <CardHeader title={PHASE_LABELS[phase]} description={`${inPhase.length} taken`} />
              <ul className="divide-y divide-zinc-100">
                {inPhase.map((t) => (
                  <li key={t.id} className="px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{t.title}</span>
                      {t.per_shoot_day && <Badge tone="info">Per draaidag</Badge>}
                      {t.optional && <Badge>Optioneel</Badge>}
                      <span className="text-xs text-zinc-600">
                        {t.anchor === "none" ? "Geen vaste datum" : `${DATE_ANCHOR_LABELS[t.anchor]} ${t.offset_days >= 0 ? "+" : ""}${t.offset_days} dagen`}
                      </span>
                    </div>
                    {editable ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs font-semibold">Bewerken</summary>
                        <TemplateTaskForm versionId={versionId} t={t} />
                        <ActionButton size="sm" variant="ghost" className="text-red-800" action={deleteTemplateTask.bind(null, versionId, t.id)} confirm="Taak uit template verwijderen?">
                          Verwijderen
                        </ActionButton>
                      </details>
                    ) : (
                      t.checklist.length > 0 && <p className="text-xs text-zinc-600">Checklist: {t.checklist.join(" · ")}</p>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
        {editable && (
          <Card>
            <CardHeader title="Taak toevoegen" />
            <CardBody>
              <TemplateTaskForm versionId={versionId} />
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}

function TemplateTaskForm({ versionId, t }: { versionId: string; t?: TT }) {
  const k = t?.id ?? "new";
  return (
    <ActionForm action={saveTemplateTask.bind(null, versionId, t?.id ?? null)} resetOnSuccess={!t} className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Titel" htmlFor={`tt-t-${k}`} required className="lg:col-span-2">
        <Input id={`tt-t-${k}`} name="title" defaultValue={t?.title} required maxLength={200} />
      </Field>
      <Field label="Fase" htmlFor={`tt-p-${k}`}>
        <Select id={`tt-p-${k}`} name="phase" defaultValue={t?.phase ?? "deal"}>
          {PHASES.slice(0, 8).map((p) => (
            <option key={p} value={p}>
              {PHASE_LABELS[p]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Volgorde" htmlFor={`tt-s-${k}`}>
        <Input id={`tt-s-${k}`} name="sort" type="number" defaultValue={t?.sort ?? 100} />
      </Field>
      <Field label="Datum t.o.v." htmlFor={`tt-a-${k}`}>
        <Select id={`tt-a-${k}`} name="anchor" defaultValue={t?.anchor ?? "none"}>
          {Object.entries(DATE_ANCHOR_LABELS).map(([a, l]) => (
            <option key={a} value={a}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Dagen (+/−)" htmlFor={`tt-o-${k}`}>
        <Input id={`tt-o-${k}`} name="offset_days" type="number" defaultValue={t?.offset_days ?? 0} />
      </Field>
      <Field label="Prioriteit" htmlFor={`tt-pr-${k}`}>
        <Select id={`tt-pr-${k}`} name="priority" defaultValue={t?.priority ?? "normaal"}>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex flex-col justify-end gap-1 text-sm">
        <label className="flex items-center gap-2">
          <Checkbox name="optional" defaultChecked={t?.optional} /> Optioneel
        </label>
        <label className="flex items-center gap-2">
          <Checkbox name="per_shoot_day" defaultChecked={t?.per_shoot_day} /> Per draaidag
        </label>
      </div>
      <Field label="Beschrijving" htmlFor={`tt-d-${k}`} className="sm:col-span-2">
        <Textarea id={`tt-d-${k}`} name="description" defaultValue={t?.description} maxLength={3000} />
      </Field>
      <Field label="Checklist (één item per regel)" htmlFor={`tt-c-${k}`} className="sm:col-span-2">
        <Textarea id={`tt-c-${k}`} name="checklist" defaultValue={t?.checklist.join("\n")} maxLength={3000} />
      </Field>
      <div>
        <SubmitButton size="sm">{t ? "Opslaan" : "Toevoegen"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
