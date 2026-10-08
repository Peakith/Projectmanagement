"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { dbError, formObject, zBool, zDate, zodError, zUrl, zUuid, type ActionResult } from "@/lib/actions";
import { APPROVAL_SOURCES, FEEDBACK_STATUSES } from "@/lib/domain/labels";
import { nextRoundInfo } from "@/lib/domain/feedback";
import { parseEuroToCents } from "@/lib/domain/money";

const rp = (id: string) => {
  revalidatePath(`/projecten/${id}`, "layout");
  revalidatePath("/");
};

const deliverableSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht").max(200),
  goal: z.string().max(2000).nullish().transform((v) => v ?? ""),
  scope: z.string().max(4000).nullish().transform((v) => v ?? ""),
  planned_delivery_date: zDate.nullish(),
  delivered_on: zDate.nullish().optional(),
  formats: z.array(z.string().trim().min(1).max(20)).max(20),
  formats_extra: z.string().max(200).nullish(),
  included_rounds: z.coerce.number().int().min(0).max(10),
});

function normalize(v: z.infer<typeof deliverableSchema>) {
  const extra = (v.formats_extra ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const { formats_extra: _ignored, ...rest } = v;
  void _ignored;
  return { ...rest, formats: [...new Set([...v.formats, ...extra])] };
}

async function guard(s: Awaited<ReturnType<typeof requireStaff>>, projectId: string, deliverableId: string) {
  const { data } = await s.supabase.from("deliverables").select("id").eq("id", deliverableId).eq("project_id", projectId).maybeSingle();
  return !!data;
}

export async function addDeliverable(projectId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const v = deliverableSchema.safeParse(formObject(fd, ["formats"]));
  if (!v.success) return zodError(v.error);
  const { error } = await s.supabase.from("deliverables").insert({ ...normalize(v.data), project_id: projectId });
  if (error) return dbError(error);
  rp(projectId);
  return { ok: true, message: "Video toegevoegd" };
}

export async function updateDeliverable(projectId: string, deliverableId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const v = deliverableSchema.safeParse(formObject(fd, ["formats"]));
  if (!v.success) return zodError(v.error);
  const { error } = await s.supabase.from("deliverables").update(normalize(v.data)).eq("id", deliverableId).eq("project_id", projectId);
  if (error) return dbError(error);
  rp(projectId);
  return { ok: true, message: "Video opgeslagen" };
}

export async function deleteDeliverable(projectId: string, deliverableId: string): Promise<ActionResult> {
  const s = await requireStaff();
  const { error } = await s.supabase.from("deliverables").delete().eq("id", deliverableId).eq("project_id", projectId);
  if (error) return dbError(error);
  rp(projectId);
  return { ok: true, message: "Video verwijderd" };
}

export async function addVersion(projectId: string, deliverableId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  if (!(await guard(s, projectId, deliverableId))) return { ok: false, error: "Niet gevonden" };
  const v = z
    .object({ version_number: z.coerce.number().int().min(1).max(999), delivered_on: zDate, review_url: zUrl.nullish(), notes: z.string().max(2000).nullish().transform((x) => x ?? "") })
    .safeParse(formObject(fd));
  if (!v.success) return zodError(v.error);
  const { error } = await s.supabase.from("deliverable_versions").insert({ ...v.data, deliverable_id: deliverableId, created_by: s.userId });
  if (error) return error.code === "23505" ? { ok: false, error: "Dit versienummer bestaat al." } : dbError(error);
  rp(projectId);
  return { ok: true, message: `Versie ${v.data.version_number} vastgelegd (verbruikt geen feedbackronde)` };
}

const roundSchema = z.object({
  version_id: zUuid.nullish(),
  requested_on: zDate.nullish(),
  feedback_due: zDate.nullish(),
  extra_reason: z.string().trim().max(1000).nullish(),
  extra_approved: zBool,
  extra_amount: z.string().max(30).nullish(),
});

/** Opent de volgende feedbackronde. Buiten de inbegrepen rondes alleen door de eigenaar, met reden en goedkeuring. */
export async function openRound(projectId: string, deliverableId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const v = roundSchema.safeParse(formObject(fd));
  if (!v.success) return zodError(v.error);
  const { data: d } = await s.supabase.from("deliverables").select("included_rounds, approved_version_id").eq("id", deliverableId).eq("project_id", projectId).maybeSingle();
  if (!d) return { ok: false, error: "Niet gevonden" };
  const { data: rounds } = await s.supabase.from("feedback_rounds").select("round_number, is_extra, status").eq("deliverable_id", deliverableId);
  const info = nextRoundInfo(d.included_rounds, rounds ?? [], !!d.approved_version_id);
  if (info.blockedByOpenRound) return { ok: false, error: "Rond eerst de lopende feedbackronde af (status Verwerkt)." };
  const row: Record<string, unknown> = {
    deliverable_id: deliverableId,
    round_number: info.nextRoundNumber,
    version_id: v.data.version_id,
    requested_on: v.data.requested_on,
    feedback_due: v.data.feedback_due,
    status: v.data.requested_on ? "wacht_op_feedback" : "gepland",
  };
  if (info.requiresExtraApproval) {
    if (s.role !== "owner") return { ok: false, error: "Een extra ronde buiten de afgesproken scope kan alleen de eigenaar openen." };
    if (!v.data.extra_reason || !v.data.extra_approved) return { ok: false, error: "Registreer eerst het extra werk: reden én goedkeuring zijn verplicht." };
    Object.assign(row, { is_extra: true, extra_reason: v.data.extra_reason, extra_approved_by: s.userId, extra_approved_at: new Date().toISOString() });
  }
  const { data: created, error } = await s.supabase.from("feedback_rounds").insert(row).select("id").single();
  if (error) return dbError(error);
  // Optioneel bedrag voor meerwerk: alleen eigenaar, in het afgeschermde deel. Er wordt niet automatisch gefactureerd.
  if (info.requiresExtraApproval && v.data.extra_amount) {
    const cents = parseEuroToCents(v.data.extra_amount);
    if (cents !== null) {
      await s.supabase.schema("finance").from("extra_work").insert({
        project_id: projectId,
        description: `Extra feedbackronde ${info.nextRoundNumber}: ${v.data.extra_reason}`,
        amount_cents: cents,
        status: "goedgekeurd",
        approved_on: new Date().toISOString().slice(0, 10),
        feedback_round_id: created.id,
      });
    }
  }
  rp(projectId);
  return { ok: true, message: info.requiresExtraApproval ? `Extra ronde ${info.nextRoundNumber} geopend` : `Ronde ${info.nextRoundNumber} geopend` };
}

export async function updateRound(projectId: string, roundId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const v = z
    .object({
      status: z.enum(FEEDBACK_STATUSES),
      version_id: zUuid.nullish(),
      requested_on: zDate.nullish(),
      feedback_due: zDate.nullish(),
      received_on: zDate.nullish(),
      processed_on: zDate.nullish(),
      notes: z.string().max(2000).nullish().transform((x) => x ?? ""),
    })
    .safeParse(formObject(fd));
  if (!v.success) return zodError(v.error);
  const today = new Date().toISOString().slice(0, 10);
  const patch = { ...v.data };
  if (patch.status === "feedback_ontvangen" && !patch.received_on) patch.received_on = today;
  if (patch.status === "verwerkt" && !patch.processed_on) patch.processed_on = today;
  if (patch.status === "wacht_op_feedback" && !patch.requested_on) patch.requested_on = today;
  const { error } = await s.supabase.from("feedback_rounds").update(patch).eq("id", roundId);
  if (error) return dbError(error);
  rp(projectId);
  return { ok: true, message: "Feedbackronde bijgewerkt" };
}

export async function approve(projectId: string, deliverableId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const v = z
    .object({ approved_version_id: zUuid, approved_on: zDate, approval_source: z.enum(APPROVAL_SOURCES), approval_reference: z.string().trim().max(500).nullish().transform((x) => x ?? "") })
    .safeParse(formObject(fd));
  if (!v.success) return zodError(v.error);
  const { error } = await s.supabase.from("deliverables").update({ ...v.data, approved_by: s.userId }).eq("id", deliverableId).eq("project_id", projectId);
  if (error) return dbError(error);
  rp(projectId);
  return { ok: true, message: "Klantakkoord vastgelegd" };
}

export async function revokeApproval(projectId: string, deliverableId: string): Promise<ActionResult> {
  const s = await requireStaff();
  const { error } = await s.supabase
    .from("deliverables")
    .update({ approved_version_id: null, approved_on: null, approval_source: null, approval_reference: "", approved_by: null })
    .eq("id", deliverableId)
    .eq("project_id", projectId);
  if (error) return dbError(error);
  rp(projectId);
  return { ok: true, message: "Akkoord ingetrokken" };
}

export async function addLink(projectId: string, deliverableId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  if (!(await guard(s, projectId, deliverableId))) return { ok: false, error: "Niet gevonden" };
  const v = z.object({ label: z.string().trim().min(1, "Omschrijving is verplicht").max(200), url: zUrl, format: z.string().max(20).nullish().transform((x) => x ?? "") }).safeParse(formObject(fd));
  if (!v.success) return zodError(v.error);
  const { error } = await s.supabase.from("deliverable_links").insert({ ...v.data, deliverable_id: deliverableId, is_final: true });
  if (error) return dbError(error);
  rp(projectId);
  return { ok: true, message: "Downloadlink toegevoegd" };
}

export async function deleteLink(projectId: string, linkId: string): Promise<ActionResult> {
  const s = await requireStaff();
  const { error } = await s.supabase.from("deliverable_links").delete().eq("id", linkId);
  if (error) return dbError(error);
  rp(projectId);
  return { ok: true, message: "Link verwijderd" };
}
