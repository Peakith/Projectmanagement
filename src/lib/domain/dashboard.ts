import { computeAttention, type Attention } from "./attention";
import { addDays, dateOfInstant, weekRange, workdaysBetween, type ISODate } from "./dates";
import { isActivePhase, isOpenStatus, PHASE_LABELS, type Phase, type TaskStatus } from "./labels";
import type { Project, Task } from "../types";

export type DashTask = Pick<Task, "id" | "project_id" | "title" | "status" | "due_date" | "optional" | "waiting_since" | "blocked_reason" | "assignee_id" | "priority" | "phase" | "freelancer_id">;
export type DashShootDay = { id: string; project_id: string; shoot_date: string; start_time: string | null; location: string; booking_statuses: string[] };
export type DashDeliverable = { id: string; project_id: string; name: string; planned_delivery_date: string | null; approved: boolean; delivered: boolean };

export type DashProject = Pick<
  Project,
  | "id" | "name" | "client_id" | "brand_id" | "lead_id" | "phase" | "deadline" | "health" | "health_note" | "priority"
  | "next_action_task_id" | "next_action_text" | "next_action_assignee_id" | "next_action_date" | "next_action_needs_update" | "follow_up_date"
>;

export type ProjectRow = {
  project: DashProject;
  clientName: string;
  nextAction: { label: string; assigneeId: string | null; date: string | null; fromTask: boolean; missing: boolean; needsUpdate: boolean };
  nextShootDate: string | null;
  attention: Attention;
  waitingClient: boolean;
  waitingExtern: boolean;
};

export type DashboardFilters = {
  fase?: string;
  klant?: string;
  verantwoordelijke?: string;
  merk?: string;
  deadline?: "verstreken" | "deze_week" | "deze_maand" | "geen";
  wacht?: "klant" | "extern" | "geen";
};

export function buildRows(
  projects: DashProject[],
  tasks: DashTask[],
  shootDays: DashShootDay[],
  clients: Map<string, string>,
  today: ISODate,
): ProjectRow[] {
  const tasksBy = groupBy(tasks, (t) => t.project_id);
  const daysBy = groupBy(shootDays, (s) => s.project_id);
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  return projects.map((p) => {
    const pt = tasksBy.get(p.id) ?? [];
    const sd = daysBy.get(p.id) ?? [];
    const nt = p.next_action_task_id ? taskById.get(p.next_action_task_id) : undefined;
    const hasText = !!p.next_action_text?.trim();
    const nextAction = nt
      ? { label: nt.title, assigneeId: p.next_action_assignee_id ?? nt.assignee_id ?? p.lead_id, date: p.next_action_date ?? nt.due_date, fromTask: true, missing: false, needsUpdate: p.next_action_needs_update }
      : hasText
        ? { label: p.next_action_text!, assigneeId: p.next_action_assignee_id ?? p.lead_id, date: p.next_action_date, fromTask: false, missing: false, needsUpdate: p.next_action_needs_update }
        : { label: p.next_action_needs_update ? "Kies een nieuwe volgende actie" : "Geen volgende actie", assigneeId: null, date: null, fromTask: false, missing: !p.next_action_task_id, needsUpdate: p.next_action_needs_update };
    const upcoming = sd.map((s) => s.shoot_date).filter((d) => d >= today).sort();
    return {
      project: p,
      clientName: (p.client_id && clients.get(p.client_id)) || "—",
      nextAction,
      nextShootDate: upcoming[0] ?? null,
      attention: computeAttention(
        { ...p, next_action_task_id: nt ? p.next_action_task_id : null },
        pt,
        sd.map((s) => ({ shoot_date: s.shoot_date, booking_statuses: s.booking_statuses })),
        today,
      ),
      waitingClient: pt.some((t) => t.status === "wacht_klant"),
      waitingExtern: pt.some((t) => t.status === "wacht_extern"),
    };
  });
}

export function applyFilters(rows: ProjectRow[], f: DashboardFilters, today: ISODate): ProjectRow[] {
  const week = weekRange(today);
  const monthEnd = addDays(today, 31);
  return rows.filter((r) => {
    const p = r.project;
    if (f.fase && p.phase !== f.fase) return false;
    if (f.klant && p.client_id !== f.klant) return false;
    if (f.verantwoordelijke && p.lead_id !== f.verantwoordelijke) return false;
    if (f.merk && p.brand_id !== f.merk) return false;
    if (f.deadline === "verstreken" && !(p.deadline && p.deadline < today)) return false;
    if (f.deadline === "deze_week" && !(p.deadline && p.deadline >= week.start && p.deadline <= week.end)) return false;
    if (f.deadline === "deze_maand" && !(p.deadline && p.deadline >= today && p.deadline <= monthEnd)) return false;
    if (f.deadline === "geen" && p.deadline) return false;
    if (f.wacht === "klant" && !r.waitingClient) return false;
    if (f.wacht === "extern" && !r.waitingExtern) return false;
    if (f.wacht === "geen" && (r.waitingClient || r.waitingExtern)) return false;
    return true;
  });
}

const LEVEL_RANK = { geblokkeerd: 0, aandacht: 1, op_schema: 2 } as const;

export type SortKey = "aandacht" | "deadline" | "fase" | "naam" | "actie";
export function sortRows(rows: ProjectRow[], key: SortKey): ProjectRow[] {
  const byDate = (a: string | null, b: string | null) => (a ?? "9999").localeCompare(b ?? "9999");
  const phaseIdx = (p: Phase) => Object.keys(PHASE_LABELS).indexOf(p);
  return [...rows].sort((a, b) => {
    switch (key) {
      case "deadline":
        return byDate(a.project.deadline, b.project.deadline);
      case "fase":
        return phaseIdx(a.project.phase) - phaseIdx(b.project.phase) || a.project.name.localeCompare(b.project.name);
      case "naam":
        return a.project.name.localeCompare(b.project.name, "nl");
      case "actie":
        return byDate(a.nextAction.date, b.nextAction.date);
      default:
        return LEVEL_RANK[a.attention.level] - LEVEL_RANK[b.attention.level] || byDate(a.project.deadline, b.project.deadline);
    }
  });
}

export type Kpis = { active: number; attention: number; overdueTasks: number; waitingClient: number };

export function kpis(rows: ProjectRow[], tasks: DashTask[], today: ISODate): Kpis {
  const activeIds = new Set(rows.filter((r) => isActivePhase(r.project.phase)).map((r) => r.project.id));
  return {
    active: activeIds.size,
    attention: rows.filter((r) => activeIds.has(r.project.id) && r.attention.level !== "op_schema").length,
    overdueTasks: tasks.filter((t) => activeIds.has(t.project_id) && isOpenStatus(t.status) && !t.optional && t.due_date && t.due_date < today).length,
    waitingClient: rows.filter((r) => activeIds.has(r.project.id) && r.waitingClient).length,
  };
}

export type AgendaItem = { date: string; kind: "project_deadline" | "deliverable" | "task" | "shoot_day"; label: string; projectId: string; projectName: string; detail?: string };

export function weekAgenda(
  rows: ProjectRow[],
  tasks: DashTask[],
  shootDays: DashShootDay[],
  deliverables: DashDeliverable[],
  today: ISODate,
): { deadlines: AgendaItem[]; shoots: AgendaItem[] } {
  const { start, end } = weekRange(today);
  const names = new Map(rows.map((r) => [r.project.id, r.project.name]));
  const inWeek = (d: string | null) => !!d && d >= start && d <= end;
  const deadlines: AgendaItem[] = [];
  for (const r of rows) {
    if (inWeek(r.project.deadline)) deadlines.push({ date: r.project.deadline!, kind: "project_deadline", label: "Projectdeadline", projectId: r.project.id, projectName: r.project.name });
  }
  for (const d of deliverables) {
    if (!d.delivered && inWeek(d.planned_delivery_date) && names.has(d.project_id))
      deadlines.push({ date: d.planned_delivery_date!, kind: "deliverable", label: `Oplevering: ${d.name}`, projectId: d.project_id, projectName: names.get(d.project_id)! });
  }
  for (const t of tasks) {
    if (isOpenStatus(t.status) && !t.optional && (t.priority === "hoog" || t.priority === "urgent") && inWeek(t.due_date) && names.has(t.project_id))
      deadlines.push({ date: t.due_date!, kind: "task", label: t.title, projectId: t.project_id, projectName: names.get(t.project_id)! });
  }
  // Eén item per draaidag (één bron), nooit dubbel geteld.
  const shoots = shootDays
    .filter((s) => inWeek(s.shoot_date) && names.has(s.project_id))
    .map((s) => ({
      date: s.shoot_date,
      kind: "shoot_day" as const,
      label: s.location || "Draaidag",
      projectId: s.project_id,
      projectName: names.get(s.project_id)!,
      detail: `${s.booking_statuses.filter((b) => b === "bevestigd").length} bevestigd${s.booking_statuses.some((b) => b !== "bevestigd" && b !== "geannuleerd") ? ", niet alles bevestigd" : ""}`,
    }));
  const byDate = (a: AgendaItem, b: AgendaItem) => a.date.localeCompare(b.date);
  return { deadlines: deadlines.sort(byDate), shoots: shoots.sort(byDate) };
}

export type WaitingItem = { taskId: string; title: string; projectId: string; projectName: string; since: string | null; workdays: number | null };

export function waitingList(rows: ProjectRow[], tasks: DashTask[], status: TaskStatus, today: ISODate): WaitingItem[] {
  const names = new Map(rows.map((r) => [r.project.id, r.project.name]));
  return tasks
    .filter((t) => t.status === status && names.has(t.project_id))
    .map((t) => {
      const since = t.waiting_since ? dateOfInstant(t.waiting_since) : null;
      return { taskId: t.id, title: t.title, projectId: t.project_id, projectName: names.get(t.project_id)!, since, workdays: since ? workdaysBetween(since, today) : null };
    })
    .sort((a, b) => (b.workdays ?? 0) - (a.workdays ?? 0));
}

export type MyAction = { kind: "task" | "next_action"; id: string; title: string; projectId: string; projectName: string; date: string | null };

/** 'Mijn acties vandaag': mijn open taken op/over datum en projecten waarvan ik de volgende actie heb. */
export function myActions(rows: ProjectRow[], tasks: DashTask[], userId: string, today: ISODate): MyAction[] {
  const names = new Map(rows.map((r) => [r.project.id, r.project.name]));
  const out: MyAction[] = [];
  const seenTasks = new Set<string>();
  for (const r of rows) {
    const na = r.nextAction;
    if (!na.missing && na.assigneeId === userId && (!na.date || na.date <= today)) {
      out.push({ kind: "next_action", id: r.project.id, title: na.label, projectId: r.project.id, projectName: r.project.name, date: na.date });
      if (r.project.next_action_task_id) seenTasks.add(r.project.next_action_task_id);
    }
  }
  for (const t of tasks) {
    if (seenTasks.has(t.id) || !names.has(t.project_id)) continue;
    if (t.assignee_id === userId && isOpenStatus(t.status) && t.due_date && t.due_date <= today)
      out.push({ kind: "task", id: t.id, title: t.title, projectId: t.project_id, projectName: names.get(t.project_id)!, date: t.due_date });
  }
  return out.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
}

function groupBy<T>(xs: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    const arr = m.get(k);
    if (arr) arr.push(x);
    else m.set(k, [x]);
  }
  return m;
}
