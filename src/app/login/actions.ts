"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import type { ActionResult } from "@/lib/action-result";

const loginSchema = z.object({ email: z.email("Vul een geldig e-mailadres in"), password: z.string().min(1, "Vul je wachtwoord in") });

function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function signIn(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed")
      return { ok: false, error: "Dit account is nog niet bevestigd. Open de uitnodigingslink, of bevestig de gebruiker in Supabase (Authentication → Users)." };
    if (error.code === "invalid_credentials" || error.status === 400)
      return { ok: false, error: "E-mailadres of wachtwoord klopt niet, of dit account bestaat (nog) niet in deze omgeving. Testaccounts uit de ontwikkelseed bestaan alleen lokaal." };
    return { ok: false, error: "Kan de inlogdienst niet bereiken. Controleer de Supabase-instellingen via /status." };
  }
  redirect(safeNext(fd.get("next")));
}

export async function requestReset(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const email = z.email().safeParse(fd.get("email"));
  if (!email.success) return { ok: false, error: "Vul een geldig e-mailadres in" };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: `${env.appUrl}/auth/callback?next=/auth/wachtwoord` });
  // Altijd dezelfde melding: verraadt niet of een account bestaat.
  return { ok: true, message: "Als dit adres bekend is, ontvang je een e-mail met een link." };
}
