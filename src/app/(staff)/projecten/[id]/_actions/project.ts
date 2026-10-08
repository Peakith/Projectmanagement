"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner, requireStaff } from "@/lib/auth";
import { dbError, formObject, zDate, zodError, zUuid, type ActionResult } from "@/lib/actions";
import { HEALTHS, PHASES, PRIORITIES } from "@/lib/domain/labels";

const rp = (id: string) => revalidatePath(`/projecten/${id}`, "layout");

const detailsSchema = z
  .object({
    name: z.string().trim().min(1, "Projectnaam is verplicht").max(200),
    client_id: zUuid.nullable(),
    brand_id: zUuid,
    lead_id: zUuid.nullable(),
    project_type: z.string().max(100).nullable().transform((v) => v ?? ""),
    priority: z.enum(PRIORITIES),
    start_date: zDate.nullable(),
    deadline: zDate.nullable(),
    follow_up_date: zDate.nullable(),
    health: z.enum(HEALTHS),
    health_note: z.string().max(500).nullable().transform((v) => v ?? ""),
    briefing: z.string().max(5000).nullable().transform((v) => v ?? ""),
    goal: z.string().max(2000).nullable().transform((v) => v ?? ""),
    target_audience: z.string().max(2000).nullable().transform((v) => v ?? ""),
    strategy: z.string().max(5000).nullable().transform((v) => v ?? ""),
    concept: z.string().max(5000).nullable().transform((v) => v ?? ""),
    crew_briefing: z.string().max(5000).nullable().transform((v) => v ?? ""),
  })
  .refine((v) => !v.start_date || !v.deadline || v.start_date <= v.deadline, { message: "Startdatum ligt na de deadline", path: ["deadline"] });

export async function updateProjectDetails(projectId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const parsed = detailsSchema.safeParse(formObject(fd));
  if (!parsed.success) return zodError(parsed.error);
  const { data: before } = await s.supabase.from("projects").select("deadline").eq("id", projectId).single();
  const { error } = await s.supabase.from("projects").update(parsed.data).eq("id", projectId);
  if (error) return dbError(error);
  rp(projectId);
  const deadlineChanged = before && before.deadline !== parsed.data.deadline;
  return { ok: true, message: deadlineChanged ? "Opgeslagen. Controleer het planningsvoorstel voor gekoppelde taken." : "Projectgegevens opgeslagen" };
}

const phaseSchema = z.object({ phase: z.enum(PHASES), confirm_closure: z.string().nullable() });

/** Lars (of een medewerker) kiest de fase. Nooit automatisch. */
export async function setPhase(projectId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const parsed = phaseSchema.safeParse(formObject(fd));
  if (!parsed.success) return zodError(parsed.error);
  if (parsed.data.phase === "afgerond" && parsed.data.confirm_closure !== "on") {
    return { ok: false, error: "Bekijk de afrondingscheck en bevestig dat je wilt afronden." };
  }
  const { error } = await s.supabase.from("projects").update({ phase: parsed.data.phase }).eq("id", projectId);
  if (error) return dbError(error);
  rp(projectId);
  revalidatePath("/");
  return { ok: true, message: "Fase gewijzigd" };
}

const nextActionSchema = z.object({
  mode: z.enum(["task", "text"]),
  task_id: zUuid.nullable(),
  text: z.string().trim().max(300).nullable(),
  assignee_id: zUuid.nullable(),
  date: zDate.nullable(),
});

/** De volgende actie wordt bewust gekozen: bij voorkeur een taak, anders een losse actie. */
export async function setNextAction(projectId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const parsed = nextActionSchema.safeParse(formObject(fd));
  if (!parsed.success) return zodError(parsed.error);
  const v = parsed.data;
  if (v.mode === "task" && !v.task_id) return { ok: false, error: "Kies een taak" };
  if (v.mode === "text" && !v.text) return { ok: false, error: "Omschrijf de actie" };
  let date = v.date;
  let assignee = v.assignee_id;
  if (v.mode === "task") {
    const { data: t } = await s.supabase.from("tasks").select("due_date, assignee_id, project_id, status").eq("id", v.task_id!).single();
    if (!t || t.project_id !== projectId) return { ok: false, error: "Taak hoort niet bij dit project" };
    if (t.status === "klaar" || t.status === "nvt") return { ok: false, error: "Kies een openstaande taak" };
    date = date ?? t.due_date;
    assignee = assignee ?? t.assignee_id;
  }
  const { error } = await s.supabase
    .from("projects")
    .update({
      next_action_task_id: v.mode === "task" ? v.task_id : null,
      next_action_text: v.mode === "text" ? v.text : null,
      next_action_assignee_id: assignee,
      next_action_date: date,
      next_action_needs_update: false,
    })
    .eq("id", projectId);
  if (error) return dbError(error);
  rp(projectId);
  revalidatePath("/");
  return { ok: true, message: "Volgende actie vastgelegd" };
}

export async function setArchived(projectId: string, archived: boolean): Promise<ActionResult> {
  const s = await requireStaff();
  const { error } = await s.supabase
    .from("projects")
    .update({ archived_at: archived ? new Date().toISOString() : null, archived_by: archived ? s.userId : null })
    .eq("id", projectId);
  if (error) return dbError(error);
  rp(projectId);
  revalidatePath("/");
  return { ok: true, message: archived ? "Project gearchiveerd" : "Project teruggezet" };
}

/** Definitief verwijderen: alleen eigenaar, alleen gearchiveerde projecten, met getypte bevestiging. */
export async function deleteProject(projectId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireOwner();
  const { data: p } = await s.supabase.from("projects").select("name, archived_at").eq("id", projectId).single();
  if (!p) return { ok: false, error: "Project niet gevonden" };
  if (!p.archived_at) return { ok: false, error: "Archiveer het project eerst." };
  if (String(fd.get("confirm_name") ?? "").trim() !== p.name) return { ok: false, error: "Typ de exacte projectnaam om te bevestigen." };
  const { error } = await s.supabase.from("projects").delete().eq("id", projectId);
  if (error) return dbError(error);
  revalidatePath("/");
  redirect("/projecten?archief=1");
}

export async function applyPlanProposal(projectId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const ids = z.array(zUuid).safeParse(fd.getAll("task_id"));
  if (!ids.success || ids.data.length === 0) return { ok: false, error: "Selecteer minstens één taak" };
  const { data, error } = await s.supabase.rpc("apply_plan_proposal", { p_project: projectId, p_task_ids: ids.data });
  if (error) return dbError(error);
  rp(projectId);
  return { ok: true, message: `${data} taakdatum(s) bijgewerkt` };
}

export async function addContact(projectId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const v = z
    .object({
      contact_id: zUuid.nullable(),
      name: z.string().trim().max(200).nullable(),
      role: z.string().max(100).nullable(),
      email: z.email("Ongeldig e-mailadres").nullable(),
      phone: z.string().max(40).nullable(),
    })
    .safeParse(formObject(fd));
  if (!v.success) return zodError(v.error);
  let contactId = v.data.contact_id;
  if (!contactId) {
    if (!v.data.name) return { ok: false, error: "Kies een contact of vul een naam in" };
    const { data: p } = await s.supabase.from("projects").select("client_id").eq("id", projectId).single();
    const { data, error } = await s.supabase
      .from("contacts")
      .insert({ client_id: p?.client_id ?? null, name: v.data.name, role: v.data.role ?? "", email: v.data.email, phone: v.data.phone })
      .select("id")
      .single();
    if (error) return dbError(error);
    contactId = data.id;
  }
  const { error } = await s.supabase.from("project_contacts").upsert({ project_id: projectId, contact_id: contactId });
  if (error) return dbError(error);
  rp(projectId);
  return { ok: true, message: "Contact gekoppeld" };
}

export async function removeContact(projectId: string, contactId: string): Promise<ActionResult> {
  const s = await requireStaff();
  const { error } = await s.supabase.from("project_contacts").delete().eq("project_id", projectId).eq("contact_id", contactId);
  if (error) return dbError(error);
  rp(projectId);
  return { ok: true, message: "Contact ontkoppeld" };
}
