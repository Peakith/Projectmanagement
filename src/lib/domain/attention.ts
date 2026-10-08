import { addDays, dateOfInstant, formatDate, workdaysBetween, type ISODate } from "./dates";
import { isActivePhase, isOpenStatus, type Health, type Phase, type TaskStatus } from "./labels";

export type AttentionProject = {
  phase: Phase;
  deadline: ISODate | null;
  health: Health;
  health_note: string;
  next_action_task_id: string | null;
  next_action_text: string | null;
  next_action_date: ISODate | null;
  next_action_needs_update: boolean;
  follow_up_date: ISODate | null;
};
export type AttentionTask = {
  title: string;
  status: TaskStatus;
  due_date: ISODate | null;
  optional: boolean;
  waiting_since: string | null;
  blocked_reason: string | null;
};
export type AttentionShootDay = { shoot_date: ISODate; booking_statuses: string[] };

export type Attention = {
  level: Health;
  reasons: string[];
  /** Informatief, verhoogt het niveau niet. */
  notes: string[];
};

/** Vanaf dit aantal werkdagen wachten vraagt een project aandacht. */
export const WAITING_ATTENTION_WORKDAYS = 3;

const PRE_DELIVERY: Phase[] = ["deal", "strategie", "preproductie", "productie", "postproductie", "oplevering"];

/**
 * Uitlegbare aandachtsindicatie. Optionele taken die zijn overgeslagen of te laat zijn
 * maken een project nooit automatisch rood.
 */
export function computeAttention(
  project: AttentionProject,
  tasks: AttentionTask[],
  shootDays: AttentionShootDay[],
  today: ISODate,
): Attention {
  const reasons: string[] = [];
  const notes: string[] = [];
  let level: Health = "op_schema";
  const raise = (l: Health) => {
    if (l === "geblokkeerd" || (l === "aandacht" && level === "op_schema")) level = l;
  };

  if (!isActivePhase(project.phase)) return { level: "op_schema", reasons, notes };

  if (project.health === "geblokkeerd") {
    raise("geblokkeerd");
    reasons.push(project.health_note ? `Handmatig: ${project.health_note}` : "Handmatig op geblokkeerd gezet");
  } else if (project.health === "aandacht") {
    raise("aandacht");
    reasons.push(project.health_note ? `Handmatig: ${project.health_note}` : "Handmatig op aandacht gezet");
  }

  for (const t of tasks) {
    if (t.status !== "geblokkeerd") continue;
    const text = `Geblokkeerd: ${t.title}${t.blocked_reason ? ` — ${t.blocked_reason}` : ""}`;
    if (t.optional) {
      raise("aandacht");
      reasons.push(text + " (optioneel)");
    } else {
      raise("geblokkeerd");
      reasons.push(text);
    }
  }

  if (project.deadline && project.deadline < today && PRE_DELIVERY.includes(project.phase)) {
    raise("aandacht");
    reasons.push(`Projectdeadline verstreken (${formatDate(project.deadline)})`);
  }

  const hasNextAction = !!project.next_action_task_id || !!project.next_action_text?.trim();
  if (project.next_action_needs_update) {
    raise("aandacht");
    reasons.push("Volgende actie is afgerond — kies een nieuwe");
  } else if (!hasNextAction) {
    raise("aandacht");
    reasons.push("Geen eerstvolgende actie");
  } else if (project.next_action_date && project.next_action_date < today) {
    raise("aandacht");
    reasons.push(`Volgende actie over datum (${formatDate(project.next_action_date)})`);
  }

  if (project.follow_up_date && project.follow_up_date <= today) {
    raise("aandacht");
    reasons.push(`Opvolgdatum bereikt (${formatDate(project.follow_up_date)})`);
  }

  const overdue = tasks.filter((t) => isOpenStatus(t.status) && !t.optional && t.due_date && t.due_date < today);
  if (overdue.length > 0) {
    raise("aandacht");
    reasons.push(overdue.length === 1 ? `Achterstallige taak: ${overdue[0].title}` : `${overdue.length} achterstallige taken`);
  }
  const optionalOverdue = tasks.filter((t) => isOpenStatus(t.status) && t.optional && t.due_date && t.due_date < today);
  if (optionalOverdue.length > 0) notes.push(`${optionalOverdue.length} optionele taak/taken over datum`);

  for (const [status, label] of [
    ["wacht_klant", "Wacht op klant"],
    ["wacht_extern", "Wacht op freelancer / leverancier"],
  ] as const) {
    const waiting = tasks
      .filter((t) => t.status === status && t.waiting_since)
      .map((t) => dateOfInstant(t.waiting_since!))
      .sort();
    if (waiting.length === 0) continue;
    const days = workdaysBetween(waiting[0], today);
    const text = `${label} sinds ${days} ${days === 1 ? "werkdag" : "werkdagen"}`;
    if (days >= WAITING_ATTENTION_WORKDAYS) {
      raise("aandacht");
      reasons.push(text);
    } else {
      notes.push(text);
    }
  }

  const soon = addDays(today, 7);
  for (const sd of shootDays) {
    if (sd.shoot_date < today || sd.shoot_date > soon) continue;
    const confirmed = sd.booking_statuses.filter((s) => s === "bevestigd").length;
    const open = sd.booking_statuses.filter((s) => s === "benaderen" || s === "aangevraagd" || s === "optie").length;
    if (open > 0 || confirmed === 0) {
      raise("aandacht");
      reasons.push(`Crew niet bevestigd voor draaidag ${formatDate(sd.shoot_date)}`);
    }
  }

  return { level, reasons, notes };
}
