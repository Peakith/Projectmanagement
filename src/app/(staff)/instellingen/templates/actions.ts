"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { dbError, formObject, zBool, zodError, zUuid, type ActionResult } from "@/lib/actions";
import { PHASES, PRIORITIES } from "@/lib/domain/labels";

const TASK_COLS = "phase, sort, title, description, checklist, anchor, offset_days, priority, optional, per_shoot_day, signal_key";

async function copyTasks(s: Awaited<ReturnType<typeof requireOwner>>, fromVersion: string | null, toVersion: string) {
  if (!fromVersion) return { error: null };
  const { data } = await s.supabase.from("template_tasks").select(TASK_COLS).eq("template_version_id", fromVersion);
  if (!data?.length) return { error: null };
  return s.supabase.from("template_tasks").insert(data.map((t) => ({ ...t, template_version_id: toVersion })));
}

export async function createDraftVersion(templateId: string): Promise<ActionResult> {
  const s = await requireOwner();
  const { data: versions } = await s.supabase.from("template_versions").select("id, version, published_at").eq("template_id", templateId).order("version", { ascending: false });
  if (versions?.some((v) => !v.published_at)) return { ok: false, error: "Er is al een conceptversie. Werk die eerst af." };
  const latest = versions?.[0];
  const { data: nv, error } = await s.supabase
    .from("template_versions")
    .insert({ template_id: templateId, version: (latest?.version ?? 0) + 1, notes: "Concept", created_by: s.userId })
    .select("id")
    .single();
  if (error) return dbError(error);
  const { error: e2 } = await copyTasks(s, latest?.id ?? null, nv.id);
  if (e2) return dbError(e2);
  revalidatePath("/instellingen/templates");
  redirect(`/instellingen/templates/${nv.id}`);
}

export async function createVariant(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireOwner();
  const v = z.object({ name: z.string().trim().min(1, "Naam is verplicht").max(100), from_version: zUuid.nullable(), description: z.string().max(500).nullable() }).safeParse(formObject(fd));
  if (!v.success) return zodError(v.error);
  const { data: t, error } = await s.supabase.from("templates").insert({ name: v.data.name, description: v.data.description ?? "" }).select("id").single();
  if (error) return dbError(error);
  const { data: nv, error: e2 } = await s.supabase.from("template_versions").insert({ template_id: t.id, version: 1, notes: "Eerste versie", created_by: s.userId }).select("id").single();
  if (e2) return dbError(e2);
  const { error: e3 } = await copyTasks(s, v.data.from_version, nv.id);
  if (e3) return dbError(e3);
  revalidatePath("/instellingen/templates");
  redirect(`/instellingen/templates/${nv.id}`);
}

export async function publishVersion(versionId: string): Promise<ActionResult> {
  const s = await requireOwner();
  const { count } = await s.supabase.from("template_tasks").select("id", { count: "exact", head: true }).eq("template_version_id", versionId);
  if (!count) return { ok: false, error: "Een lege versie kan niet worden gepubliceerd." };
  const { error } = await s.supabase.from("template_versions").update({ published_at: new Date().toISOString(), notes: "Gepubliceerd" }).eq("id", versionId);
  if (error) return dbError(error);
  revalidatePath("/instellingen/templates", "layout");
  return { ok: true, message: "Versie gepubliceerd. Nieuwe projecten gebruiken deze versie; bestaande projecten veranderen niet." };
}

export async function deleteDraftVersion(versionId: string): Promise<ActionResult> {
  const s = await requireOwner();
  const { error } = await s.supabase.from("template_versions").delete().eq("id", versionId).is("published_at", null);
  if (error) return dbError(error);
  revalidatePath("/instellingen/templates");
  redirect("/instellingen/templates");
}

export async function setDefaultTemplate(templateId: string): Promise<ActionResult> {
  const s = await requireOwner();
  await s.supabase.from("templates").update({ is_default: false }).eq("is_default", true);
  const { error } = await s.supabase.from("templates").update({ is_default: true }).eq("id", templateId);
  if (error) return dbError(error);
  revalidatePath("/instellingen/templates");
  return { ok: true, message: "Standaardtemplate ingesteld" };
}

const taskSchema = z
  .object({
    phase: z.enum(PHASES),
    sort: z.coerce.number().int().min(0).max(10000),
    title: z.string().trim().min(1, "Titel is verplicht").max(200),
    description: z.string().max(3000).nullable().transform((x) => x ?? ""),
    checklist: z.string().max(3000).nullable().transform((x) => (x ?? "").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 30)),
    anchor: z.enum(["none", "project_start", "project_deadline", "shoot_day"]),
    offset_days: z.coerce.number().int().min(-365).max(365),
    priority: z.enum(PRIORITIES),
    optional: zBool,
    per_shoot_day: zBool,
  })
  .refine((v) => !v.per_shoot_day || v.anchor === "shoot_day", { message: "Taken per draaidag moeten de draaidag als referentie hebben", path: ["anchor"] });

export async function saveTemplateTask(versionId: string, taskId: string | null, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireOwner();
  const v = taskSchema.safeParse(formObject(fd));
  if (!v.success) return zodError(v.error);
  const q = taskId
    ? s.supabase.from("template_tasks").update(v.data).eq("id", taskId).eq("template_version_id", versionId)
    : s.supabase.from("template_tasks").insert({ ...v.data, template_version_id: versionId });
  const { error } = await q;
  if (error) return dbError(error, "Opslaan mislukt. Gepubliceerde versies zijn niet te wijzigen.");
  revalidatePath(`/instellingen/templates/${versionId}`);
  return { ok: true, message: taskId ? "Taak opgeslagen" : "Taak toegevoegd" };
}

export async function deleteTemplateTask(versionId: string, taskId: string): Promise<ActionResult> {
  const s = await requireOwner();
  const { error } = await s.supabase.from("template_tasks").delete().eq("id", taskId).eq("template_version_id", versionId);
  if (error) return dbError(error);
  revalidatePath(`/instellingen/templates/${versionId}`);
  return { ok: true, message: "Taak verwijderd" };
}
