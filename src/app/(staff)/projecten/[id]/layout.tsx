import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getProject } from "@/lib/data/project";
import { formatDate } from "@/lib/domain/dates";
import { PhaseBadge, PriorityBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { TabsNav } from "@/components/tabs-nav";
import { PhaseControl } from "./phase-control";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { s, project, client, brand, lead } = await getProject(id);
  const owner = s.role === "owner";
  const tabs = [
    { href: "", label: "Overzicht" },
    { href: "/taken", label: "Taken" },
    { href: "/productie", label: "Productie & crew" },
    { href: "/deliverables", label: "Deliverables" },
    { href: "/documenten", label: "Documenten & links" },
    { href: "/activiteit", label: "Activiteit" },
    ...(owner ? [{ href: "/financien", label: "Financiën" }, { href: "/klantportaal", label: "Klantportaal" }] : []),
  ];
  return (
    <>
      <Link href="/projecten" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-ink">
        <ChevronLeft className="size-4" aria-hidden /> Projecten
      </Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>{project.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-600">
            <span>{client?.name ?? "Geen klant"}</span>
            <span aria-hidden>·</span>
            <span>{brand?.name}</span>
            <span aria-hidden>·</span>
            <span>Verantwoordelijke: {lead?.full_name ?? "—"}</span>
            <span aria-hidden>·</span>
            <span>Deadline: {formatDate(project.deadline, { year: true })}</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <PhaseBadge phase={project.phase} />
            <PriorityBadge priority={project.priority} />
            {project.archived_at && <Badge tone="warn">Gearchiveerd</Badge>}
          </div>
        </div>
        <PhaseControl projectId={project.id} phase={project.phase} archived={!!project.archived_at} />
      </div>
      <TabsNav base={`/projecten/${project.id}`} tabs={tabs} />
      {children}
    </>
  );
}
