"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";

const viewSchema = z.object({ view: z.enum(["tabel", "bord"]).optional(), sort: z.enum(["aandacht", "deadline", "fase", "naam", "actie"]).optional() });

/** Onschuldige weergavevoorkeuren per gebruiker (database, niet localStorage). */
export async function saveDashboardPrefs(fd: FormData) {
  const s = await requireSession();
  const parsed = viewSchema.safeParse({ view: fd.get("view") ?? undefined, sort: fd.get("sort") ?? undefined });
  if (!parsed.success) return;
  const { data: current } = await s.supabase.from("user_preferences").select("value").eq("user_id", s.userId).eq("key", "dashboard").maybeSingle();
  const value = { ...(current?.value ?? {}), ...Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v)) };
  await s.supabase.from("user_preferences").upsert({ user_id: s.userId, key: "dashboard", value, updated_at: new Date().toISOString() });
  revalidatePath("/");
}
