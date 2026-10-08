"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { dbError, type ActionResult } from "@/lib/actions";
import { CREW_TASK_STATUSES } from "@/lib/domain/labels";

/** Freelancer mag alleen status (beperkt) en checklist-afvinken wijzigen; de database dwingt dit af. */
export async function crewUpdateTask(projectId: string, taskId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireRole("freelancer");
  const status = z.enum(CREW_TASK_STATUSES as [string, ...string[]]).safeParse(fd.get("status"));
  if (!status.success) return { ok: false, error: "Ongeldige status" };
  const ids = fd.getAll("item_ids").map(String);
  const done = new Set(fd.getAll("done").map(String));
  const checklist = Object.fromEntries(ids.map((id) => [id, done.has(id)]));
  const { error } = await s.supabase.rpc("crew_update_task", { p_task: taskId, p_status: status.data, p_checklist_done: checklist });
  if (error) return dbError(error);
  revalidatePath(`/crew/${projectId}`);
  return { ok: true, message: "Taak bijgewerkt" };
}

export async function crewComment(projectId: string, taskId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireRole("freelancer");
  const body = z.string().trim().min(1, "Schrijf een opmerking").max(4000).safeParse(fd.get("body"));
  if (!body.success) return { ok: false, error: body.error.issues[0].message };
  const { error } = await s.supabase.rpc("crew_add_comment", { p_task: taskId, p_body: body.data });
  if (error) return dbError(error);
  revalidatePath(`/crew/${projectId}`);
  return { ok: true, message: "Opmerking geplaatst" };
}
