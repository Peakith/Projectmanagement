import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { formatDate } from "@/lib/domain/dates";
import type { PortalSnapshot } from "@/lib/domain/portal";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Projectportaal" };

export default async function PortalHome() {
  const s = await requireRole("client");
  // RLS: alleen gepubliceerde momentopnames van projecten met actieve toegang.
  const { data } = await s.supabase.from("portal_snapshots").select("project_id, content, published_at").order("published_at", { ascending: false });
  const items = (data ?? []) as { project_id: string; content: PortalSnapshot; published_at: string }[];
  return (
    <>
      <PageHeader title="Jouw projecten" description="Hier volg je de voortgang van jullie projecten met Studio Brutaal." />
      {items.length === 0 ? (
        <EmptyState title="Nog niets gedeeld">Zodra Studio Brutaal de voortgang van een project deelt, verschijnt die hier.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((i) => (
            <Link key={i.project_id} href={`/portaal/${i.project_id}`}>
              <Card className="h-full p-4 hover:border-ink">
                <p className="font-heading text-lg font-bold">{i.content.project_name}</p>
                {i.content.phase_label && <Badge tone="dark">{i.content.phase_label}</Badge>}
                {i.content.next_step && <p className="mt-2 text-sm">Volgende stap: {i.content.next_step}</p>}
                <p className="mt-1 text-xs text-zinc-500">Bijgewerkt {formatDate(i.published_at.slice(0, 10))}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
