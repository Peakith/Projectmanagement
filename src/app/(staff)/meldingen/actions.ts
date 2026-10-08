"use server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { dbError, type ActionResult } from "@/lib/actions";

export async function markRead(id?: string): Promise<ActionResult> {
  const s = await requireSession();
  let q = s.supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (id) q = q.eq("id", id);
  const { error } = await q;
  if (error) return dbError(error);
  revalidatePath("/", "layout");
  return { ok: true, message: id ? "Gelezen" : "Alles gelezen" };
}
