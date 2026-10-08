import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import type { Project } from "@/lib/types";

/** Laadt een project met de sessie van de gebruiker; RLS bepaalt toegang. Onbekend/geen toegang => 404. */
export const getProject = cache(async (id: string) => {
  const s = await requireStaff();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = await s.supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const project = data as Project;
  const [{ data: client }, { data: brand }, { data: lead }] = await Promise.all([
    project.client_id ? s.supabase.from("clients").select("id, name").eq("id", project.client_id).maybeSingle() : Promise.resolve({ data: null }),
    s.supabase.from("brands").select("id, name").eq("id", project.brand_id).maybeSingle(),
    project.lead_id ? s.supabase.from("profiles").select("id, full_name").eq("id", project.lead_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return { s, project, client: client as { id: string; name: string } | null, brand: brand as { id: string; name: string } | null, lead: lead as { id: string; full_name: string } | null };
});
