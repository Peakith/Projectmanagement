import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Service-client die RLS omzeilt. ALLEEN gebruiken voor:
 *  - accountbeheer (uitnodigen) nadat de eigenaarsrol is gecontroleerd,
 *  - geplande jobs en de offerte-integratie.
 * Nooit voor gewone gebruikersverzoeken.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY ontbreekt (alleen server-side instellen).");
  return createClient(env.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
