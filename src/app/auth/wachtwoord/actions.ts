"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";

const schema = z
  .object({ password: z.string().min(10, "Gebruik minimaal 10 tekens"), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "De wachtwoorden zijn niet gelijk", path: ["confirm"] });

export async function setPassword(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = schema.safeParse({ password: fd.get("password"), confirm: fd.get("confirm") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: "Je sessie is verlopen. Open de link opnieuw." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: "Wachtwoord instellen is niet gelukt. Kies een sterker wachtwoord of probeer opnieuw." };
  redirect("/");
}
