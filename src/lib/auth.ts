import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/domain/labels";

export type Session = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  email: string;
  name: string;
  role: AppRole | null;
};

/**
 * Haalt de gebruiker op (gevalideerd bij Supabase Auth) en de rol uit de server-side
 * beheerde tabel user_roles. Nooit uit user_metadata.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: roleRow }, { data: profile }] = await Promise.all([
    supabase.from("user_roles").select("role, active").eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  return {
    supabase,
    userId: user.id,
    email: user.email ?? "",
    name: profile?.full_name || user.email || "",
    role: roleRow?.active ? (roleRow.role as AppRole) : null,
  };
});

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function requireRole(...roles: AppRole[]): Promise<Session & { role: AppRole }> {
  const s = await requireSession();
  if (!s.role || !roles.includes(s.role)) redirect("/geen-toegang");
  return s as Session & { role: AppRole };
}

export const requireStaff = () => requireRole("owner", "employee");
export const requireOwner = () => requireRole("owner");

export function homeFor(role: AppRole | null): string {
  switch (role) {
    case "owner":
    case "employee":
      return "/";
    case "freelancer":
      return "/crew";
    case "client":
      return "/portaal";
    default:
      return "/geen-toegang";
  }
}
