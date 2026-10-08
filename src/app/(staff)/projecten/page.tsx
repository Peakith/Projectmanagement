import type { Metadata } from "next";
import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { lookups, allProfiles } from "@/lib/data/overview";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { PHASES, PHASE_LABELS, type Phase } from "@/lib/domain/labels";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, Td, Th } from "@/components/ui/table";
import { PhaseBadge, PriorityBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Projecten" };

type SP = { q?: string; fase?: string; archief?: string; sort?: string };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await requireStaff();
  const sp = await searchParams;
  const today = todayISO();
  let q = s.supabase.from("projects").select("id, name, client_id, phase, deadline, priority, lead_id, project_type, archived_at, created_at, updated_at");
  q = sp.archief === "1" ? q.not("archived_at", "is", null) : q.is("archived_at", null);
  if (sp.fase && (PHASES as readonly string[]).includes(sp.fase)) q = q.eq("phase", sp.fase);
  const [{ data: projects }, refs, names] = await Promise.all([q, lookups(s.supabase), allProfiles(s.supabase)]);
  const clients = new Map(refs.clients.map((c) => [c.id, c.name]));
  const term = (sp.q ?? "").trim().toLowerCase();
  let rows = (projects ?? []).filter(
    (p) => !term || p.name.toLowerCase().includes(term) || (clients.get(p.client_id ?? "") ?? "").toLowerCase().includes(term) || p.project_type.toLowerCase().includes(term),
  );
  const sort = sp.sort ?? "naam";
  rows = rows.sort((a, b) => {
    if (sort === "deadline") return (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999");
    if (sort === "fase") return PHASES.indexOf(a.phase as Phase) - PHASES.indexOf(b.phase as Phase);
    if (sort === "gewijzigd") return b.updated_at.localeCompare(a.updated_at);
    if (sort === "klant") return (clients.get(a.client_id ?? "") ?? "").localeCompare(clients.get(b.client_id ?? "") ?? "", "nl");
    return a.name.localeCompare(b.name, "nl");
  });

  return (
    <>
      <PageHeader
        title="Projecten"
        description={sp.archief === "1" ? "Gearchiveerde projecten" : "Alle projecten, ook afgeronde en verloren"}
        actions={
          <>
            <Button asChild variant="outline">
              <a href="/api/export/projecten">
                <Download aria-hidden /> Exporteren (CSV)
              </a>
            </Button>
            <Button asChild>
              <Link href="/projecten/nieuw">
                <Plus aria-hidden /> Nieuw project
              </Link>
            </Button>
          </>
        }
      />
      <Card>
        <form method="get" className="flex flex-wrap items-end gap-3 border-b border-zinc-100 p-4" role="search">
          <div className="flex min-w-56 flex-1 flex-col gap-1">
            <Label htmlFor="q">Zoeken</Label>
            <Input id="q" name="q" defaultValue={sp.q} placeholder="Projectnaam, klant of type" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="fase">Fase</Label>
            <Select id="fase" name="fase" defaultValue={sp.fase ?? ""}>
              <option value="">Alle fases</option>
              {PHASES.map((p) => (
                <option key={p} value={p}>
                  {PHASE_LABELS[p]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="sort">Sorteren</Label>
            <Select id="sort" name="sort" defaultValue={sort}>
              <option value="naam">Naam</option>
              <option value="klant">Klant</option>
              <option value="deadline">Deadline</option>
              <option value="fase">Fase</option>
              <option value="gewijzigd">Laatst gewijzigd</option>
            </Select>
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" name="archief" value="1" defaultChecked={sp.archief === "1"} className="size-4 accent-ink" /> Archief
          </label>
          <Button variant="dark">Toepassen</Button>
        </form>
        {rows.length === 0 ? (
          <div className="p-4">
            <EmptyState title="Geen projecten gevonden">{term ? "Pas je zoekterm aan." : <Link href="/projecten/nieuw" className="underline">Nieuw project</Link>}</EmptyState>
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Project</Th>
                <Th>Klant</Th>
                <Th>Fase</Th>
                <Th>Verantwoordelijke</Th>
                <Th>Deadline</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-zinc-50">
                  <Td>
                    <Link href={`/projecten/${p.id}`} className="font-heading font-bold hover:underline">
                      {p.name}
                    </Link>
                    <div className="mt-0.5 flex gap-1">
                      {p.project_type && <span className="text-xs text-zinc-600">{p.project_type}</span>}
                      <PriorityBadge priority={p.priority} />
                      {p.archived_at && <Badge>Gearchiveerd</Badge>}
                    </div>
                  </Td>
                  <Td>{clients.get(p.client_id ?? "") ?? "—"}</Td>
                  <Td>
                    <PhaseBadge phase={p.phase} />
                  </Td>
                  <Td>{names.get(p.lead_id ?? "") ?? "—"}</Td>
                  <Td className={p.deadline && p.deadline < today && !["afgerond", "verloren"].includes(p.phase) ? "font-semibold text-red-800" : ""}>{formatDate(p.deadline, { year: true })}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
