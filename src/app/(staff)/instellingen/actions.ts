"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner, requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { dbError, formObject, zodError, zUuid, type ActionResult } from "@/lib/actions";
import { runJobs } from "@/lib/jobs/runner";

// --- Profiel (iedereen intern) ---------------------------------------------
export async function updateProfile(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const v = z.string().trim().min(1, "Naam is verplicht").max(120).safeParse(fd.get("full_name"));
  if (!v.success) return zodError(v.error);
  const { error } = await s.supabase.from("profiles").update({ full_name: v.data }).eq("id", s.userId);
  if (error) return dbError(error);
  revalidatePath("/", "layout");
  return { ok: true, message: "Profiel opgeslagen" };
}

export async function changePassword(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const v = z
    .object({ password: z.string().min(10, "Gebruik minimaal 10 tekens"), confirm: z.string() })
    .refine((x) => x.password === x.confirm, { message: "Wachtwoorden zijn niet gelijk" })
    .safeParse({ password: fd.get("password"), confirm: fd.get("confirm") });
  if (!v.success) return zodError(v.error);
  const { error } = await s.supabase.auth.updateUser({ password: v.data.password });
  if (error) return { ok: false, error: "Wachtwoord wijzigen is niet gelukt." };
  return { ok: true, message: "Wachtwoord gewijzigd" };
}

// --- Gebruikers (alleen eigenaar) ------------------------------------------
const link = (hashed: string, type: "invite" | "recovery") =>
  `${env.appUrl}/auth/callback?token_hash=${encodeURIComponent(hashed)}&type=${type}&next=/auth/wachtwoord`;

const inviteSchema = z.object({
  email: z.email("Ongeldig e-mailadres"),
  full_name: z.string().trim().min(1, "Naam is verplicht").max(120),
  role: z.enum(["employee", "freelancer", "client"]),
  freelancer_id: zUuid.nullish(),
  project_id: zUuid.nullish(),
});

/**
 * Nodigt een gebruiker uit. De eigenaarsrol wordt gecontroleerd (server + database).
 * De service-sleutel wordt alleen gebruikt voor het aanmaken van het auth-account; de rol
 * wordt gezet via admin_set_role met de sessie van de eigenaar (database controleert opnieuw).
 */
export async function inviteUser(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireOwner();
  const v = inviteSchema.safeParse(formObject(fd));
  if (!v.success) return zodError(v.error);
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email: v.data.email, options: { data: { full_name: v.data.full_name } } });
  if (error) {
    return { ok: false, error: /already|registered|exists/i.test(error.message) ? "Er bestaat al een account met dit e-mailadres. Pas de rol aan in de lijst." : "Uitnodigen is niet gelukt." };
  }
  const userId = data.user.id;
  await admin.from("profiles").upsert({ id: userId, email: v.data.email, full_name: v.data.full_name });
  const r = await s.supabase.rpc("admin_set_role", { p_user: userId, p_role: v.data.role });
  if (r.error) return dbError(r.error);
  if (v.data.role === "freelancer" && v.data.freelancer_id) {
    const l = await s.supabase.rpc("admin_link_freelancer", { p_freelancer: v.data.freelancer_id, p_user: userId });
    if (l.error) return dbError(l.error);
  }
  if (v.data.role === "client" && v.data.project_id) {
    const a = await s.supabase.from("portal_access").insert({ project_id: v.data.project_id, user_id: userId, granted_by: s.userId });
    if (a.error) return dbError(a.error);
  }
  revalidatePath("/instellingen/gebruikers");
  return { ok: true, message: "Account aangemaakt", data: { link: link(data.properties.hashed_token, "invite"), email: v.data.email } };
}

export async function newLoginLink(userId: string): Promise<ActionResult> {
  const s = await requireOwner();
  const { data: users } = await s.supabase.rpc("admin_list_users");
  const u = (users ?? []).find((x: { user_id: string }) => x.user_id === userId) as { email: string } | undefined;
  if (!u) return { ok: false, error: "Gebruiker niet gevonden" };
  const { data, error } = await createAdminClient().auth.admin.generateLink({ type: "recovery", email: u.email });
  if (error) return { ok: false, error: "Link maken is niet gelukt" };
  return { ok: true, message: "Nieuwe inloglink gemaakt", data: { link: link(data.properties.hashed_token, "recovery"), email: u.email } };
}

export async function setRole(userId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireOwner();
  const role = z.enum(["employee", "freelancer", "client"]).safeParse(fd.get("role"));
  if (!role.success) return { ok: false, error: "Ongeldige rol" };
  const { error } = await s.supabase.rpc("admin_set_role", { p_user: userId, p_role: role.data });
  if (error) return dbError(error);
  revalidatePath("/instellingen/gebruikers");
  return { ok: true, message: "Rol gewijzigd" };
}

export async function setActive(userId: string, active: boolean): Promise<ActionResult> {
  const s = await requireOwner();
  const { error } = await s.supabase.rpc("admin_set_active", { p_user: userId, p_active: active });
  if (error) return dbError(error);
  // Intrekken werkt direct: elke database-aanvraag controleert de actieve rol opnieuw,
  // ook met een nog geldig token.
  revalidatePath("/instellingen/gebruikers");
  return { ok: true, message: active ? "Toegang hersteld" : "Toegang ingetrokken" };
}

export async function linkFreelancer(userId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireOwner();
  const fid = zUuid.safeParse(fd.get("freelancer_id"));
  if (!fid.success) return { ok: false, error: "Kies een freelancer" };
  const { error } = await s.supabase.rpc("admin_link_freelancer", { p_freelancer: fid.data, p_user: userId });
  if (error) return dbError(error);
  revalidatePath("/instellingen/gebruikers");
  return { ok: true, message: "Gekoppeld" };
}

// --- Merken -----------------------------------------------------------------
export async function addBrand(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireOwner();
  const name = z.string().trim().min(1).max(100).safeParse(fd.get("name"));
  if (!name.success) return { ok: false, error: "Naam is verplicht" };
  const slug = name.data.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const { error } = await s.supabase.from("brands").insert({ name: name.data, slug });
  if (error) return dbError(error);
  revalidatePath("/instellingen");
  return { ok: true, message: "Merk toegevoegd" };
}

// --- Automatisering -----------------------------------------------------------
/** Handmatig de jobs draaien (eigenaar). Gebruikt de service-client zoals de scheduler. */
export async function runJobsNow(): Promise<ActionResult> {
  await requireOwner();
  const results = await runJobs(createAdminClient(), { worker: "handmatig" });
  revalidatePath("/instellingen/automatisering");
  revalidatePath("/", "layout");
  const failed = results.filter((r) => !r.ok).length;
  return failed ? { ok: false, error: `${results.length} job(s) verwerkt, ${failed} mislukt (zie overzicht)` } : { ok: true, message: `${results.length} job(s) verwerkt` };
}
