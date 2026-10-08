"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { PHASES, PHASE_LABELS, type Phase } from "@/lib/domain/labels";
import { formatDate } from "@/lib/domain/dates";
import { setNextAction } from "./_actions/project";

export function NextActionForm({
  projectId,
  tasks,
  staff,
  current,
}: {
  projectId: string;
  tasks: { id: string; title: string; phase: Phase; due_date: string | null }[];
  staff: { id: string; name: string }[];
  current: { taskId: string | null; text: string | null; assignee: string | null; date: string | null };
}) {
  const [mode, setMode] = useState<"task" | "text">(current.text && !current.taskId ? "text" : "task");
  return (
    <details className="rounded-md border border-zinc-200 p-3" open={!current.taskId && !current.text}>
      <summary className="cursor-pointer text-sm font-semibold">Volgende actie kiezen of wijzigen</summary>
      <ActionForm action={setNextAction.bind(null, projectId)} className="mt-3 grid gap-3 sm:grid-cols-2">
        <fieldset className="flex gap-4 text-sm sm:col-span-2">
          <legend className="sr-only">Soort actie</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="mode" value="task" checked={mode === "task"} onChange={() => setMode("task")} className="accent-ink" /> Taak uit dit project (aanbevolen)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="mode" value="text" checked={mode === "text"} onChange={() => setMode("text")} className="accent-ink" /> Losse actie
          </label>
        </fieldset>
        {mode === "task" ? (
          <Field label="Taak" htmlFor="na-task" className="sm:col-span-2">
            <Select id="na-task" name="task_id" defaultValue={current.taskId ?? ""}>
              <option value="">Kies een openstaande taak</option>
              {PHASES.filter((p) => tasks.some((t) => t.phase === p)).map((p) => (
                <optgroup key={p} label={PHASE_LABELS[p]}>
                  {tasks
                    .filter((t) => t.phase === p)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                        {t.due_date ? ` (${formatDate(t.due_date)})` : ""}
                      </option>
                    ))}
                </optgroup>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Actie" htmlFor="na-text" className="sm:col-span-2">
            <Input id="na-text" name="text" defaultValue={current.text ?? ""} maxLength={300} placeholder="Bijv. Klant bellen over planning" />
          </Field>
        )}
        <Field label="Wie" htmlFor="na-who" hint={mode === "task" ? "Leeg = verantwoordelijke van de taak" : undefined}>
          <Select id="na-who" name="assignee_id" defaultValue={current.assignee ?? ""}>
            <option value="">—</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Wanneer" htmlFor="na-date" hint={mode === "task" ? "Leeg = deadline van de taak" : undefined}>
          <Input id="na-date" name="date" type="date" defaultValue={current.date ?? ""} />
        </Field>
        <div className="sm:col-span-2">
          <SubmitButton size="sm">Volgende actie opslaan</SubmitButton>
        </div>
      </ActionForm>
    </details>
  );
}
