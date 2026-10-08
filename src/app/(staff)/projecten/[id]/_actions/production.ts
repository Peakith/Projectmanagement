"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { dbError, formObject, zBool, zDate, zodError, zTime, zUrl, zUuid, type ActionResult } from "@/lib/actions";
import { BOOKING_STATUSES } from "@/lib/domain/labels";

const rp = (id: string) => {
  revalidatePath(`/projecten/${id}`, "layout");
  revalidatePath("/");
  revalidatePath("/planning");
};

const dayBase = {
  shoot_date: zDate,
  start_time: zTime.nullable(),
  end_time: zTime.nullable(),
  location: z.string().max(200).nullable().transform((v) => v ?? ""),
  address: z.string().max(300).nullable().transform((v) => v ?? ""),
};

export async function addShootDay(projectId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const v = z.object({ ...dayBase, with_tasks: zBool }).safeParse(formObject(fd));
  if (!v.success) return zodError(v.error);
  const { error } = await s.supabase.rpc("add_shoot_day", {
    p_project: projectId,
    p_date: v.data.shoot_date,
    p_start: v.data.start_time,
    p_end: v.data.end_time,
    p_location: v.data.location,
    p_address: v.data.address,
    p_with_tasks: v.data.with_tasks,
  });
  if (error) return error.code === "23505" ? { ok: false, error: "Er is al een draaidag op deze datum voor dit project." } : dbError(error);
  rp(projectId);
  return { ok: true, message: "Draaidag toegevoegd" };
}

const daySchema = z.object({
  ...dayBase,
  schedule: z.string().max(5000).nullable().transform((v) => v ?? ""),
  callsheet_url: zUrl.nullable(),
  crew_notes: z.string().max(3000).nullable().transform((v) => v ?? ""),
  internal_notes: z.string().max(3000).nullable().transform((v) => v ?? ""),
});

export async function updateShootDay(projectId: string, dayId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const v = daySchema.safeParse(formObject(fd));
  if (!v.success) return zodError(v.error);
  const { data: before } = await s.supabase.from("shoot_days").select("shoot_date").eq("id", dayId).single();
  const { error } = await s.supabase.from("shoot_days").update(v.data).eq("id", dayId).eq("project_id", projectId);
  if (error) return error.code === "23505" ? { ok: false, error: "Er is al een draaidag op deze datum." } : dbError(error);
  rp(projectId);
  if (before && before.shoot_date !== v.data.shoot_date)
    return { ok: true, message: "Draaidag verplaatst. Bekijk het planningsvoorstel op het overzicht om gekoppelde taakdatums te bevestigen." };
  return { ok: true, message: "Draaidag opgeslagen" };
}

export async function deleteShootDay(projectId: string, dayId: string): Promise<ActionResult> {
  const s = await requireStaff();
  // Open taken die specifiek voor deze draaidag zijn aangemaakt verdwijnen mee; afgeronde taken blijven bewaard.
  await s.supabase.from("tasks").delete().eq("project_id", projectId).eq("shoot_day_id", dayId).not("template_task_id", "is", null).not("status", "in", "(klaar,nvt)");
  const { error } = await s.supabase.from("shoot_days").delete().eq("id", dayId).eq("project_id", projectId);
  if (error) return dbError(error);
  rp(projectId);
  return { ok: true, message: "Draaidag verwijderd" };
}

const bookingSchema = z.object({
  freelancer_id: zUuid,
  role: z.string().trim().max(100).nullable().transform((v) => v ?? ""),
  status: z.enum(BOOKING_STATUSES),
  work_description: z.string().max(2000).nullable().transform((v) => v ?? ""),
  internal_notes: z.string().max(2000).nullable().transform((v) => v ?? ""),
  shoot_day_ids: z.array(zUuid),
});

async function syncDays(s: Awaited<ReturnType<typeof requireStaff>>, bookingId: string, ids: string[]) {
  await s.supabase.from("booking_shoot_days").delete().eq("booking_id", bookingId);
  if (ids.length) return s.supabase.from("booking_shoot_days").insert(ids.map((d) => ({ booking_id: bookingId, shoot_day_id: d })));
  return { error: null };
}

export async function addBooking(projectId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const v = bookingSchema.safeParse(formObject(fd, ["shoot_day_ids"]));
  if (!v.success) return zodError(v.error);
  const { shoot_day_ids, ...row } = v.data;
  const { data, error } = await s.supabase.from("bookings").insert({ ...row, project_id: projectId }).select("id").single();
  if (error) return dbError(error);
  const { error: e2 } = await syncDays(s, data.id, shoot_day_ids);
  if (e2) return dbError(e2);
  rp(projectId);
  return { ok: true, message: "Boeking toegevoegd" };
}

export async function updateBooking(projectId: string, bookingId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const v = bookingSchema.safeParse(formObject(fd, ["shoot_day_ids"]));
  if (!v.success) return zodError(v.error);
  const { shoot_day_ids, ...row } = v.data;
  const { error } = await s.supabase.from("bookings").update(row).eq("id", bookingId).eq("project_id", projectId);
  if (error) return dbError(error);
  const { error: e2 } = await syncDays(s, bookingId, shoot_day_ids);
  if (e2) return dbError(e2);
  rp(projectId);
  return { ok: true, message: "Boeking opgeslagen" };
}

export async function deleteBooking(projectId: string, bookingId: string): Promise<ActionResult> {
  const s = await requireStaff();
  const { error } = await s.supabase.from("bookings").delete().eq("id", bookingId).eq("project_id", projectId);
  if (error) return dbError(error);
  rp(projectId);
  return { ok: true, message: "Boeking verwijderd" };
}
