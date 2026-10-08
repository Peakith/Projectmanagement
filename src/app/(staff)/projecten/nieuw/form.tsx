"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PRIORITIES, PRIORITY_LABELS } from "@/lib/domain/labels";
import { createProject } from "../actions";

type Opt = { id: string; name?: string; full_name?: string };

export function NewProjectForm({
  clients,
  staff,
  brands,
  templates,
  me,
}: {
  clients: Opt[];
  staff: Opt[];
  brands: Opt[];
  templates: { id: string; name: string; isDefault: boolean; version: number }[];
  me: string;
}) {
  const [newClient, setNewClient] = useState(clients.length === 0);
  const [dates, setDates] = useState<number[]>([0]);
  return (
    <ActionForm action={createProject} success="Project aangemaakt" className="grid gap-4 sm:grid-cols-2">
      <Field label="Projectnaam" htmlFor="name" required className="sm:col-span-2">
        <Input id="name" name="name" required maxLength={200} autoFocus />
      </Field>
      {newClient ? (
        <Field label="Nieuwe klant" htmlFor="new_client_name" hint="Bestaat de klant al? Dan wordt die gekoppeld.">
          <Input id="new_client_name" name="new_client_name" maxLength={200} />
        </Field>
      ) : (
        <Field label="Klant" htmlFor="client_id">
          <Select id="client_id" name="client_id" defaultValue="">
            <option value="">Kies een klant</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="flex items-end">
        <Button type="button" variant="link" onClick={() => setNewClient(!newClient)}>
          {newClient ? "Bestaande klant kiezen" : "+ Nieuwe klant"}
        </Button>
      </div>
      <Field label="Merk" htmlFor="brand_id">
        <Select id="brand_id" name="brand_id" defaultValue={brands[0]?.id}>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Projectverantwoordelijke" htmlFor="lead_id">
        <Select id="lead_id" name="lead_id" defaultValue={me}>
          {staff.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Projecttype" htmlFor="project_type" hint="Bijv. merkfilm, campagne, aftermovie">
        <Input id="project_type" name="project_type" maxLength={100} />
      </Field>
      <Field label="Prioriteit" htmlFor="priority">
        <Select id="priority" name="priority" defaultValue="normaal">
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Startdatum" htmlFor="start_date">
        <Input id="start_date" name="start_date" type="date" />
      </Field>
      <Field label="Projectdeadline" htmlFor="deadline" hint="Leeg laten mag: taken die hiervan afhangen blijven dan ongepland.">
        <Input id="deadline" name="deadline" type="date" />
      </Field>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1.5 text-sm font-semibold">Draaidagen</legend>
        <p className="mb-2 text-xs text-zinc-500">Per draaidag worden de productietaken aangemaakt. Je kunt later meer draaidagen toevoegen.</p>
        <div className="flex flex-wrap gap-2">
          {dates.map((k, i) => (
            <div key={k}>
              <label htmlFor={`shoot-${k}`} className="sr-only">
                Draaidag {i + 1}
              </label>
              <Input id={`shoot-${k}`} name="shoot_dates" type="date" className="w-44" />
            </div>
          ))}
          {dates.length < 10 && (
            <Button type="button" variant="outline" onClick={() => setDates([...dates, Date.now()])}>
              + Draaidag
            </Button>
          )}
        </div>
      </fieldset>
      <Field label="Template" htmlFor="template_id" className="sm:col-span-2">
        <Select id="template_id" name="template_id" defaultValue={templates.find((t) => t.isDefault)?.id}>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} (versie {t.version})
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Korte briefing" htmlFor="briefing" className="sm:col-span-2">
        <Textarea id="briefing" name="briefing" maxLength={5000} />
      </Field>
      <Field label="Doel" htmlFor="goal">
        <Textarea id="goal" name="goal" maxLength={2000} />
      </Field>
      <Field label="Doelgroep" htmlFor="target_audience">
        <Textarea id="target_audience" name="target_audience" maxLength={2000} />
      </Field>
      <div className="sm:col-span-2">
        <SubmitButton>Project aanmaken</SubmitButton>
      </div>
    </ActionForm>
  );
}
