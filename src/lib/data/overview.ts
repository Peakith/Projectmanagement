import "server-only";
import type { Session } from "@/lib/auth";
import { fetchAll } from "./fetch-all";
import type { DashDeliverable, DashProject, DashShootDay, DashTask } from "@/lib/domain/dashboard";
import type { Brand, Client, Profile } from "@/lib/types";

type DB = Session["supabase"];

const PROJECT_COLS =
  "id, name, client_id, brand_id, lead_id, phase, deadline, health, health_note, priority, next_action_task_id, next_action_text, next_action_assignee_id, next_action_date, next_action_needs_update, follow_up_date";
const TASK_COLS = "id, project_id, title, status, due_date, optional, waiting_since, blocked_reason, assignee_id, priority, phase, freelancer_id";

/** Alle niet-gearchiveerde projecten met open taken, draaidagen en deliverables (RLS bepaalt zichtbaarheid). */
export async function loadOverview(db: DB, opts: { includeClosed?: boolean } = {}) {
  let pq = db.from("projects").select(PROJECT_COLS).is("archived_at", null).order("name");
  if (!opts.includeClosed) pq = pq.not("phase", "in", "(afgerond,verloren)");
  const { data: projects, error } = await pq;
  if (error) throw new Error(error.message);
  const ids = (projects ?? []).map((p) => p.id);
  if (ids.length === 0) return { projects: [] as DashProject[], tasks: [] as DashTask[], shootDays: [] as DashShootDay[], deliverables: [] as DashDeliverable[], ...(await lookups(db)) };

  const nextIds = (projects ?? []).map((p) => p.next_action_task_id).filter(Boolean) as string[];
  const [openTasks, nextTasks, days, bsd, deliverables, refs] = await Promise.all([
    fetchAll<DashTask>((a, b) => db.from("tasks").select(TASK_COLS).in("project_id", ids).not("status", "in", "(klaar,nvt)").order("id").range(a, b)),
    nextIds.length ? db.from("tasks").select(TASK_COLS).in("id", nextIds).then((r) => r.data ?? []) : Promise.resolve([] as DashTask[]),
    fetchAll<{ id: string; project_id: string; shoot_date: string; start_time: string | null; location: string }>((a, b) =>
      db.from("shoot_days").select("id, project_id, shoot_date, start_time, location").in("project_id", ids).order("id").range(a, b),
    ),
    fetchAll<{ shoot_day_id: string; bookings: { status: string } | null }>((a, b) =>
      db.from("booking_shoot_days").select("shoot_day_id, bookings(status)").order("shoot_day_id").range(a, b),
    ),
    fetchAll<{ id: string; project_id: string; name: string; planned_delivery_date: string | null; approved_version_id: string | null; delivered_on: string | null }>((a, b) =>
      db.from("deliverables").select("id, project_id, name, planned_delivery_date, approved_version_id, delivered_on").in("project_id", ids).order("id").range(a, b),
    ),
    lookups(db),
  ]);
  const statusesByDay = new Map<string, string[]>();
  for (const r of bsd) {
    if (!r.bookings) continue;
    const arr = statusesByDay.get(r.shoot_day_id) ?? [];
    arr.push(r.bookings.status);
    statusesByDay.set(r.shoot_day_id, arr);
  }
  const taskMap = new Map<string, DashTask>();
  for (const t of [...openTasks, ...(nextTasks as DashTask[])]) taskMap.set(t.id, t);
  return {
    projects: (projects ?? []) as DashProject[],
    tasks: [...taskMap.values()],
    shootDays: days.map((d) => ({ ...d, booking_statuses: (statusesByDay.get(d.id) ?? []).filter((s) => s !== "geannuleerd") })),
    deliverables: deliverables.map((d) => ({ id: d.id, project_id: d.project_id, name: d.name, planned_delivery_date: d.planned_delivery_date, approved: !!d.approved_version_id, delivered: !!d.delivered_on })),
    ...refs,
  };
}

export async function lookups(db: DB) {
  const [{ data: clients }, { data: staff }, { data: brands }] = await Promise.all([
    db.from("clients").select("id, name").order("name"),
    db.rpc("staff_members"),
    db.from("brands").select("id, name, slug").eq("active", true).order("name"),
  ]);
  return {
    clients: (clients ?? []) as Client[],
    staff: ((staff ?? []) as { id: string; full_name: string }[]).map((s) => ({ id: s.id, full_name: s.full_name, email: null })) as Profile[],
    brands: (brands ?? []) as Brand[],
  };
}

export async function allProfiles(db: DB): Promise<Map<string, string>> {
  const { data } = await db.from("profiles").select("id, full_name");
  return new Map((data ?? []).map((p) => [p.id, p.full_name]));
}
