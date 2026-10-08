import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { formatDate } from "@/lib/domain/dates";
import { PHASE_LABELS, type Phase } from "@/lib/domain/labels";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Mijn projecten" };

export default async function CrewHome() {
  const s = await requireRole("freelancer");
  const { data, error } = await s.supabase.rpc("crew_projects");
  const projects = (data ?? []) as { project_id: string; name: string; client_name: string | null; phase: Phase; next_shoot_date: string | null; my_roles: string | null }[];
  return (
    <>
      <PageHeader title="Mijn projecten" description="Projecten waarvoor je bent geboekt, met gedeelde briefing, planning en taken." />
      {error || projects.length === 0 ? (
        <EmptyState title="Geen projecten">Je bent op dit moment niet geboekt op een project, of je account is nog niet gekoppeld.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.project_id} href={`/crew/${p.project_id}`} className="block">
              <Card className="h-full p-4 hover:border-ink">
                <p className="font-heading text-lg font-bold">{p.name}</p>
                <p className="text-sm text-zinc-600">{p.client_name}</p>
                <p className="mt-2 text-sm">{p.my_roles ? `Jouw rol: ${p.my_roles}` : ""}</p>
                <p className="text-sm">{p.next_shoot_date ? `Eerstvolgende draaidag: ${formatDate(p.next_shoot_date, { weekday: true })}` : "Geen geplande draaidag"}</p>
                <p className="mt-1 text-xs text-zinc-500">Fase: {PHASE_LABELS[p.phase]}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
