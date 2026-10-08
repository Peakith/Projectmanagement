"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwner, requireStaff } from "@/lib/auth";
import { dbError, formObject, zBool, zodError, type ActionResult } from "@/lib/actions";
import { AVAILABILITY } from "@/lib/domain/labels";

const schema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht").max(200),
  specialisms: z.string().max(300).nullable().transform((v) => (v ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 15)),
  email: z.email("Ongeldig e-mailadres").nullable(),
  phone: z.string().max(40).nullable(),
  city: z.string().max(100).nullable().transform((v) => v ?? ""),
  notes: z.string().max(4000).nullable().transform((v) => v ?? ""),
  availability: z.enum(AVAILABILITY),
  availability_note: z.string().max(300).nullable().transform((v) => v ?? ""),
  active: zBool.optional(),
});

export async function createFreelancer(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const v = schema.safeParse(formObject(fd));
  if (!v.success) return zodError(v.error);
  const { data, error } = await s.supabase.from("freelancers").insert({ ...v.data, active: true }).select("id").single();
  if (error) return dbError(error);
  revalidatePath("/freelancers");
  redirect(`/freelancers/${data.id}`);
}

export async function updateFreelancer(id: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const v = schema.safeParse(formObject(fd));
  if (!v.success) return zodError(v.error);
  const { error } = await s.supabase.from("freelancers").update({ ...v.data, active: v.data.active ?? false }).eq("id", id);
  if (error) return dbError(error);
  revalidatePath("/freelancers");
  revalidatePath(`/freelancers/${id}`);
  return { ok: true, message: "Freelancer opgeslagen" };
}

export async function deleteFreelancer(id: string): Promise<ActionResult> {
  const s = await requireOwner();
  const { error } = await s.supabase.from("freelancers").delete().eq("id", id);
  if (error) return error.code === "23503" ? { ok: false, error: "Deze freelancer heeft boekingen. Zet hem op inactief in plaats van verwijderen." } : dbError(error);
  revalidatePath("/freelancers");
  redirect("/freelancers");
}
