import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

export function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Omgevingsvariabele ${name} ontbreekt (zie .env.example).`);
    process.exit(1);
  }
  return v;
}

export const SUPABASE_URL = () => need("NEXT_PUBLIC_SUPABASE_URL");

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL(), need("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function userClient(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(SUPABASE_URL(), need("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Inloggen als ${email} mislukt: ${error.message}`);
  return c;
}

export function isLocalUrl(url: string): boolean {
  const host = new URL(url).hostname;
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

export async function findUserByEmail(admin: SupabaseClient, email: string) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}
