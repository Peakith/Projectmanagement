"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PHASES, PHASE_LABELS, PRIORITIES, PRIORITY_LABELS, TASK_STATUSES, TASK_STATUS_LABELS, DATE_ANCHOR_LABELS, type TaskStatus } from "@/lib/domain/labels";
import { formatDate } from "@/lib/domain/dates";
import type { ChecklistItem, Task } from "@/lib/types";
import { updateTask } from "../../_actions/tasks";

type Opt = { id: string; label: string };

export function TaskForm({
  task,
  staff,
  freelancers,
  shootDays,
  deliverables,
  otherTasks,
  dependsOn,
}: {
  task: Task;
  staff: Opt[];
  freelancers: Opt[];
  shootDays: Opt[];
  deliverables: Opt[];
  otherTasks: Opt[];
  dependsOn: string[];
}) {
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [items, setItems] = useState<ChecklistItem[]>(task.checklist);
  const [newItem, setNewItem] = useState("");
  const [freelancer, setFreelancer] = useState(task.freelancer_id ?? "");

  return (
    <ActionForm action={updateTask.bind(null, task.project_id, task.id)} success="Taak opgeslagen" className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="checklist" value={JSON.stringify(items)} />
      <Field label="Titel" htmlFor="t-title" required className="sm:col-span-2">
        <Input id="t-title" name="title" defaultValue={task.title} required maxLength={300} />
      </Field>
      <Field label="Status" htmlFor="t-status">
        <Select id="t-status" name="status" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {TASK_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Fase" htmlFor="t-phase">
        <Select id="t-phase" name="phase" defaultValue={task.phase}>
          {PHASES.slice(0, 8).map((p) => (
            <option key={p} value={p}>
              {PHASE_LABELS[p]}
            </option>
          ))}
        </Select>
      </Field>
      {status === "geblokkeerd" && (
        <Field label="Reden voor blokkade" htmlFor="t-blocked" required className="sm:col-span-2">
          <Input id="t-blocked" name="blocked_reason" defaultValue={task.blocked_reason ?? ""} required maxLength={500} />
        </Field>
      )}
      {status === "nvt" && (
        <Field label="Waarom niet van toepassing?" htmlFor="t-nvt" required className="sm:col-span-2">
          <Input id="t-nvt" name="nvt_reason" defaultValue={task.nvt_reason ?? ""} required maxLength={500} />
        </Field>
      )}
      <Field label="Interne verantwoordelijke" htmlFor="t-who" hint="Blijft verantwoordelijk, ook als een freelancer het werk doet.">
        <Select id="t-who" name="assignee_id" defaultValue={task.assignee_id ?? ""}>
          <option value="">—</option>
          {staff.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Prioriteit" htmlFor="t-prio">
        <Select id="t-prio" name="priority" defaultValue={task.priority}>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Gekoppelde freelancer" htmlFor="t-fl">
        <Select id="t-fl" name="freelancer_id" value={freelancer} onChange={(e) => setFreelancer(e.target.value)}>
          <option value="">—</option>
          {freelancers.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex items-end pb-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="shared_with_freelancer" defaultChecked={task.shared_with_freelancer} disabled={!freelancer} />
          Delen met deze freelancer (alleen als die een account heeft)
        </label>
      </div>
      <Field
        label="Deadline"
        htmlFor="t-due"
        hint={task.anchor !== "none" ? `Berekend t.o.v. ${DATE_ANCHOR_LABELS[task.anchor].toLowerCase()} (${task.offset_days >= 0 ? "+" : ""}${task.offset_days} dagen).` : undefined}
      >
        <Input id="t-due" name="due_date" type="date" defaultValue={task.due_date ?? ""} />
      </Field>
      <Field label="Opvolgdatum" htmlFor="t-follow" hint="Bijvoorbeeld wanneer je de klant opnieuw benadert.">
        <Input id="t-follow" name="follow_up_date" type="date" defaultValue={task.follow_up_date ?? ""} />
      </Field>
      {task.anchor !== "none" && (
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <Checkbox name="keep_anchor" />
          Datum blijft meeschuiven met de referentiedatum (anders wordt een handmatige datum vast)
        </label>
      )}
      <Field label="Draaidag" htmlFor="t-day">
        <Select id="t-day" name="shoot_day_id" defaultValue={task.shoot_day_id ?? ""}>
          <option value="">—</option>
          {shootDays.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Deliverable" htmlFor="t-del">
        <Select id="t-del" name="deliverable_id" defaultValue={task.deliverable_id ?? ""}>
          <option value="">—</option>
          {deliverables.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Beschrijving" htmlFor="t-desc" className="sm:col-span-2">
        <Textarea id="t-desc" name="description" defaultValue={task.description} maxLength={5000} rows={4} />
      </Field>

      <fieldset className="sm:col-span-2">
        <legend className="mb-2 text-sm font-semibold">Checklist</legend>
        {items.length === 0 && <p className="mb-2 text-sm text-zinc-500">Geen checklistitems.</p>}
        <ul className="mb-2 flex flex-col gap-1">
          {items.map((it, i) => (
            <li key={it.id} className="flex items-center gap-2">
              <Checkbox
                id={`cl-${it.id}`}
                checked={it.done}
                onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))}
              />
              <label htmlFor={`cl-${it.id}`} className={`flex-1 text-sm ${it.done ? "text-zinc-500 line-through" : ""}`}>
                {it.text}
              </label>
              <Button type="button" size="icon" variant="ghost" aria-label={`Verwijder ${it.text}`} onClick={() => setItems(items.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <label htmlFor="cl-new" className="sr-only">
            Nieuw checklistitem
          </label>
          <Input
            id="cl-new"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="Nieuw item"
            maxLength={300}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (newItem.trim()) {
                  setItems([...items, { id: crypto.randomUUID(), text: newItem.trim(), done: false }]);
                  setNewItem("");
                }
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!newItem.trim()) return;
              setItems([...items, { id: crypto.randomUUID(), text: newItem.trim(), done: false }]);
              setNewItem("");
            }}
          >
            Toevoegen
          </Button>
        </div>
      </fieldset>

      <Field label="Afhankelijk van (eerst afronden)" htmlFor="t-deps" className="sm:col-span-2" hint="Ctrl/Cmd-klik voor meerdere taken.">
        <Select id="t-deps" name="depends_on" multiple defaultValue={dependsOn} className="h-32 py-1">
          {otherTasks.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <SubmitButton>Opslaan</SubmitButton>
        {task.completed_at && <span className="text-xs text-zinc-500">Afgerond op {formatDate(task.completed_at.slice(0, 10), { year: true })}</span>}
      </div>
    </ActionForm>
  );
}
