"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { dbError, zodError, zUuid, type ActionResult } from "@/lib/actions";
import { buildSnapshot, portalDraftSchema } from "@/lib/domain/portal";
import { loadSnapshotSource } from "@/lib/data/portal";

const rp = (id: string) => revalidatePath(`/projecten/${id}/klantportaal`);

function draftFromForm(fd: FormData) {
  const titles = fd.getAll("milestone_title").map(String);
  const dates = fd.getAll("milestone_date").map(String);
  const str = (k: string) => String(fd.get(k) ?? "").trim();
  return portalDraftSchema.safeParse({
    phase_label: str("phase_label"),
    goal: str("goal"),
    scope: str("scope"),
    next_step: str("next_step"),
    next_step_date: str("next_step_date") || null,
    milestones: titles.map((t, i) => ({ title: t.trim(), date: dates[i] || null })).filter((m) => m.title),
    show_shoot_days: fd.get("show_shoot_days") === "on",
    deliverable_ids: fd.getAll("deliverable_ids").map(String),
    show_review_links: fd.get("show_review_links") === "on",
    show_final_links: fd.get("show_final_links") === "on",
  });
}

export async function saveDraft(projectId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireOwner();
  const v = draftFromForm(fd);
  if (!v.success) return zodError(v.error);
  const { error } = await s.supabase.from("portal_drafts").upsert({ project_id: projectId, content: v.data, updated_at: new Date().toISOString(), updated_by: s.userId });
  if (error) return dbError(error);
  rp(projectId);
  return { ok: true, message: "Concept opgeslagen. Bekijk de preview en publiceer wanneer je klaar bent." };
}

/** Expliciete publicatie: maakt een momentopname van het concept met de actuele deliverables. */
export async function publish(projectId: string): Promise<ActionResult> {
  const s = await requireOwner();
  const { data } = await s.supabase.from("portal_drafts").select("content").eq("project_id", projectId).maybeSingle();
  const draft = portalDraftSchema.safeParse(data?.content ?? {});
  if (!data || !draft.success) return { ok: false, error: "Sla eerst een concept op." };
  const snapshot = buildSnapshot(draft.data, await loadSnapshotSource(s.supabase, projectId));
  const { error } = await s.supabase.from("portal_snapshots").upsert({ project_id: projectId, content: snapshot, published_at: new Date().toISOString(), published_by: s.userId });
  if (error) return dbError(error);
  rp(projectId);
  return { ok: true, message: "Gepubliceerd voor de klant" };
}

export async function unpublish(projectId: string): Promise<ActionResult> {
  const s = await requireOwner();
  const { error } = await s.supabase.from("portal_snapshots").delete().eq("project_id", projectId);
  if (error) return dbError(error);
  rp(projectId);
  return { ok: true, message: "Publicatie ingetrokken" };
}

export async function grantAccess(projectId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireOwner();
  const v = zUuid.safeParse(fd.get("user_id"));
  if (!v.success) return { ok: false, error: "Kies een klantaccount" };
  const { error } = await s.supabase.from("portal_access").insert({ project_id: projectId, user_id: v.data, granted_by: s.userId });
  if (error) return error.code === "23505" ? { ok: false, error: "Deze klant heeft al toegang." } : dbError(error);
  rp(projectId);
  return { ok: true, message: "Toegang verleend" };
}

export async function revokeAccess(projectId: string, accessId: string): Promise<ActionResult> {
  const s = await requireOwner();
  const ok = z.uuid().safeParse(accessId);
  if (!ok.success) return { ok: false, error: "Ongeldig" };
  const { error } = await s.supabase.from("portal_access").update({ revoked_at: new Date().toISOString(), revoked_by: s.userId }).eq("id", accessId).eq("project_id", projectId);
  if (error) return dbError(error);
  rp(projectId);
  return { ok: true, message: "Toegang ingetrokken" };
}
