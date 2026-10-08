import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

export const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
export const PASSWORD = process.env.SEED_PASSWORD!;

export const USERS = {
  owner: "lars@studiobrutaal.test",
  employee: "stagiaire@studiobrutaal.test",
  freelancer: "joris@freelance.test",
  clientA: "klant-a@rivierstad.test",
  clientB: "klant-b@korrel.test",
} as const;

const cache = new Map<string, SupabaseClient>();

/** Echte, beperkte sessie: inloggen via Supabase Auth met de publieke sleutel. */
export async function as(who: keyof typeof USERS): Promise<SupabaseClient> {
  if (cache.has(who)) return cache.get(who)!;
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: USERS[who], password: PASSWORD });
  if (error) throw new Error(`login ${who}: ${error.message}`);
  cache.set(who, c);
  return c;
}

export function anon(): SupabaseClient {
  return createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Alleen voor het opzetten/opruimen van testsituaties, nooit om rechten te 'bewijzen'. */
export function service(): SupabaseClient {
  return createClient(URL, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function projectId(name: string): Promise<string> {
  const { data, error } = await service().from("projects").select("id").eq("name", name).single();
  if (error) throw error;
  return data.id;
}

export async function userId(who: keyof typeof USERS): Promise<string> {
  const c = await as(who);
  const { data } = await c.auth.getUser();
  return data.user!.id;
}
