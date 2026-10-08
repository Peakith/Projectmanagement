"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CLIENT_PHASE_SUGGESTIONS, type PortalDraft } from "@/lib/domain/portal";
import { saveDraft } from "../_actions/portal";

export function DraftForm({ projectId, draft, deliverables }: { projectId: string; draft: PortalDraft; deliverables: { id: string; name: string }[] }) {
  const [milestones, setMilestones] = useState(draft.milestones.map((m, i) => ({ ...m, k: i })));
  return (
    <ActionForm action={saveDraft.bind(null, projectId)} success="Concept opgeslagen" className="flex flex-col gap-4">
      <Field label="Klantvriendelijke fase" htmlFor="pd-phase">
        <Input id="pd-phase" name="phase_label" list="client-phases" defaultValue={draft.phase_label} maxLength={80} />
      </Field>
      <datalist id="client-phases">
        {CLIENT_PHASE_SUGGESTIONS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <Field label="Volgende stap voor de klant" htmlFor="pd-next" hint="Bijv. 'Feedback op versie 1 voor vrijdag'. Los van de interne volgende actie.">
        <Input id="pd-next" name="next_step" defaultValue={draft.next_step} maxLength={500} />
      </Field>
      <Field label="Datum volgende stap" htmlFor="pd-next-date">
        <Input id="pd-next-date" name="next_step_date" type="date" defaultValue={draft.next_step_date ?? ""} />
      </Field>
      <Field label="Afgesproken doel" htmlFor="pd-goal">
        <Textarea id="pd-goal" name="goal" defaultValue={draft.goal} maxLength={2000} />
      </Field>
      <Field label="Scope en afspraken" htmlFor="pd-scope">
        <Textarea id="pd-scope" name="scope" defaultValue={draft.scope} maxLength={4000} />
      </Field>
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">Gedeelde mijlpalen</legend>
        <ul className="flex flex-col gap-2">
          {milestones.map((m, i) => (
            <li key={m.k} className="flex gap-2">
              <label className="sr-only" htmlFor={`ms-t-${m.k}`}>
                Mijlpaal
              </label>
              <Input id={`ms-t-${m.k}`} name="milestone_title" defaultValue={m.title} maxLength={200} placeholder="Omschrijving" />
              <label className="sr-only" htmlFor={`ms-d-${m.k}`}>
                Datum
              </label>
              <Input id={`ms-d-${m.k}`} name="milestone_date" type="date" defaultValue={m.date ?? ""} className="w-44" />
              <Button type="button" variant="ghost" size="icon" aria-label="Mijlpaal verwijderen" onClick={() => setMilestones(milestones.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setMilestones([...milestones, { title: "", date: null, k: Date.now() }])}>
          + Mijlpaal
        </Button>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="show_shoot_days" defaultChecked={draft.show_shoot_days} /> Draaidagen tonen (datum, starttijd, locatie)
      </label>
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">Video&apos;s die de klant ziet</legend>
        {deliverables.length === 0 && <p className="text-sm text-zinc-600">Nog geen video&apos;s vastgelegd.</p>}
        {deliverables.map((d) => (
          <label key={d.id} className="flex items-center gap-2 text-sm">
            <Checkbox name="deliverable_ids" value={d.id} defaultChecked={draft.deliverable_ids.includes(d.id)} /> {d.name}
          </label>
        ))}
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="show_review_links" defaultChecked={draft.show_review_links} /> Vimeo-reviewlink van de laatste versie tonen
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="show_final_links" defaultChecked={draft.show_final_links} /> Definitieve downloadlinks tonen
      </label>
      <div>
        <SubmitButton>Concept opslaan</SubmitButton>
      </div>
    </ActionForm>
  );
}
