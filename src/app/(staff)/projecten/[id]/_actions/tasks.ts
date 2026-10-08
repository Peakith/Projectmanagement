"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { dbError, formObject, zBool, zDate, zodError, zUuid, type ActionResult } from "@/lib/actions";
import { PHASES, PRIORITIES, TASK_STATUSES } from "@/lib/domain/labels";

const rp = (id: string) => {
  revalidatePath(`/projecten/${id}`, "layout");
  revalidatePath("/");
};

export async function quickStatus(projectId: string, taskId: string, status: string, reason?: string): Promise<ActionResult> {
  const s = await requireStaff();
  const st = z.enum(TASK_STATUSES).safeParse(status);
  if (!st.success) return { ok: false, error: "Ongeldige status" };
  if ((st.data === "geblokkeerd" || st.data === "nvt") && !reason?.trim()) return { ok: false, error: "Geef een reden op" };
  const patch: Record<string, unknown> = { status: st.data };
  if (st.data === "geblokkeerd") patch.blocked_reason = reason!.trim().slice(0, 500);
  if (st.data === "nvt") patch.nvt_reason = reason!.trim().slice(0, 500);
  const { error } = await s.supabase.from("tasks").update(patch).eq("id", taskId).eq("project_id", projectId);
  if (error) return dbError(error);
  rp(projectId);
  return { ok: true, message: "Status bijgewerkt" };
}

const checklistSchema = z.array(z.object({ id: z.string().min(1).max(64), text: z.string().trim().min(1).max(300), done: z.boolean() })).max(50);

const taskSchema = z
  .object({
    title: z.string().trim().min(1, "Titel is verplicht").max(300),
    description: z.string().max(5000).nullable().transform((v) => v ?? ""),
    phase: z.enum(PHASES),
    status: z.enum(TASK_STATUSES),
    priority: z.enum(PRIORITIES),
    blocked_reason: z.string().trim().max(500).nullable(),
    nvt_reason: z.string().trim().max(500).nullable(),
    assignee_id: zUuid.nullable(),
    freelancer_id: zUuid.nullable(),
    shared_with_freelancer: zBool,
    due_date: zDate.nullable(),
    follow_up_date: zDate.nullable(),
    shoot_day_id: zUuid.nullable(),
    deliverable_id: zUuid.nullable(),
    checklist: z.string().nullable(),
    depends_on: z.array(zUuid),
    keep_anchor: zBool,
  })
  .refine((v) => v.status !== "geblokkeerd" || !!v.blocked_reason, { message: "Geef een reden voor de blokkade", path: ["blocked_reason"] })
  .refine((v) => v.status !== "nvt" || !!v.nvt_reason, { message: "Geef een reden waarom de taak niet van toepassing is", path: ["nvt_reason"] })
  .refine((v) => !v.shared_with_freelancer || !!v.freelancer_id, { message: "Kies eerst een freelancer om mee te delen", path: ["shared_with_freelancer"] });

export async function updateTask(projectId: string, taskId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const parsed = taskSchema.safeParse(formObject(fd, ["depends_on"]));
  if (!parsed.success) return zodError(parsed.error);
  const v = parsed.data;
  let checklist: z.infer<typeof checklistSchema> = [];
  try {
    checklist = checklistSchema.parse(JSON.parse(v.checklist ?? "[]"));
  } catch {
    return { ok: false, error: "Checklist is ongeldig" };
  }
  const { data: before } = await s.supabase.from("tasks").select("due_date").eq("id", taskId).single();
  const patch: Record<string, unknown> = {
    title: v.title,
    description: v.description,
    phase: v.phase,
    status: v.status,
    priority: v.priority,
    blocked_reason: v.blocked_reason,
    nvt_reason: v.nvt_reason,
    assignee_id: v.assignee_id,
    freelancer_id: v.freelancer_id,
    shared_with_freelancer: v.shared_with_freelancer,
    due_date: v.due_date,
    follow_up_date: v.follow_up_date,
    shoot_day_id: v.shoot_day_id,
    deliverable_id: v.deliverable_id,
    checklist,
  };
  // Handmatig gewijzigde deadline: niet meer automatisch meeschuiven, tenzij bewust gekozen.
  if (before && before.due_date !== v.due_date && !v.keep_anchor) patch.anchor = "none";
  const { error } = await s.supabase.from("tasks").update(patch).eq("id", taskId).eq("project_id", projectId);
  if (error) return dbError(error);
  const deps = v.depends_on.filter((d) => d !== taskId);
  await s.supabase.from("task_dependencies").delete().eq("task_id", taskId);
  if (deps.length) {
    const { error: depErr } = await s.supabase.from("task_dependencies").insert(deps.map((d) => ({ task_id: taskId, depends_on_task_id: d })));
    if (depErr) return dbError(depErr);
  }
  rp(projectId);
  return { ok: true, message: "Taak opgeslagen" };
}

const newTaskSchema = z.object({
  title: z.string().trim().min(1, "Titel is verplicht").max(300),
  phase: z.enum(PHASES),
  priority: z.enum(PRIORITIES).default("normaal"),
  assignee_id: zUuid.nullable(),
  due_date: zDate.nullable(),
  description: z.string().max(5000).nullable().transform((v) => v ?? ""),
  parent_task_id: zUuid.nullable(),
});

export async function createTask(projectId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const parsed = newTaskSchema.safeParse(formObject(fd));
  if (!parsed.success) return zodError(parsed.error);
  const { data: max } = await s.supabase.from("tasks").select("sort").eq("project_id", projectId).eq("phase", parsed.data.phase).order("sort", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await s.supabase
    .from("tasks")
    .insert({ ...parsed.data, project_id: projectId, sort: (max?.sort ?? 0) + 10, created_by: s.userId })
    .select("id")
    .single();
  if (error) return dbError(error);
  rp(projectId);
  return { ok: true, message: "Taak toegevoegd", id: data.id };
}

export async function deleteTask(projectId: string, taskId: string): Promise<ActionResult> {
  const s = await requireStaff();
  const { error } = await s.supabase.from("tasks").delete().eq("id", taskId).eq("project_id", projectId);
  if (error) return dbError(error);
  rp(projectId);
  redirect(`/projecten/${projectId}/taken`);
}

export async function addComment(projectId: string, taskId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const v = z.object({ body: z.string().trim().min(1, "Schrijf een opmerking").max(4000), visible_to_crew: zBool }).safeParse(formObject(fd));
  if (!v.success) return zodError(v.error);
  const { error } = await s.supabase.from("task_comments").insert({ task_id: taskId, author_id: s.userId, ...v.data });
  if (error) return dbError(error);
  revalidatePath(`/projecten/${projectId}/taken/${taskId}`);
  return { ok: true, message: "Opmerking geplaatst" };
}

/** Kleine opdracht: alle open taken van een fase met reden op 'Niet van toepassing'. */
export async function phaseNotApplicable(projectId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const v = z.object({ phase: z.enum(PHASES), reason: z.string().trim().min(1, "Geef een reden").max(500) }).safeParse(formObject(fd));
  if (!v.success) return zodError(v.error);
  const { data, error } = await s.supabase
    .from("tasks")
    .update({ status: "nvt", nvt_reason: v.data.reason })
    .eq("project_id", projectId)
    .eq("phase", v.data.phase)
    .not("status", "in", "(klaar,nvt)")
    .select("id");
  if (error) return dbError(error);
  rp(projectId);
  return { ok: true, message: `${data.length} taak/taken op niet van toepassing gezet` };
}

