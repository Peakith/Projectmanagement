import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/**
 * Supabase-client met de sessie van de ingelogde gebruiker. Alle gewone verzoeken
 * gaan hierlangs, zodat Row Level Security in de database altijd geldt.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Aangeroepen vanuit een Server Component: de proxy ververst de sessie al.
        }
      },
    },
  });
}
