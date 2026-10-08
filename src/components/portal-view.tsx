import { CalendarDays, Download, ExternalLink } from "lucide-react";
import type { PortalSnapshot } from "@/lib/domain/portal";
import { formatDate, formatTime } from "@/lib/domain/dates";
import { Badge } from "@/components/ui/badge";

/** Klantweergave van een gepubliceerde momentopname. Wordt ook gebruikt voor de preview van de eigenaar. */
export function PortalView({ s, publishedAt }: { s: PortalSnapshot; publishedAt?: string | null }) {
  return (
    <article className="flex flex-col gap-5">
      <header>
        <p className="text-sm text-zinc-600">{s.client_name}</p>
        <h2 className="text-2xl font-extrabold">{s.project_name}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {s.phase_label && <Badge tone="dark">Fase: {s.phase_label}</Badge>}
          {publishedAt && <span className="text-xs text-zinc-500">Bijgewerkt op {formatDate(publishedAt.slice(0, 10), { year: true })}</span>}
        </div>
      </header>
      {s.next_step && (
        <section className="rounded-lg border-l-4 border-brand bg-white p-4">
          <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-600">Volgende stap</h3>
          <p className="mt-1 font-heading text-lg font-bold">{s.next_step}</p>
          {s.next_step_date && <p className="text-sm text-zinc-700">Graag vóór {formatDate(s.next_step_date, { weekday: true, year: true })}</p>}
        </section>
      )}
      {(s.goal || s.scope) && (
        <section className="grid gap-4 rounded-lg bg-white p-4 sm:grid-cols-2">
          {s.goal && (
            <div>
              <h3 className="text-sm font-bold">Doel</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm">{s.goal}</p>
            </div>
          )}
          {s.scope && (
            <div>
              <h3 className="text-sm font-bold">Afspraken en scope</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm">{s.scope}</p>
            </div>
          )}
        </section>
      )}
      {(s.milestones.length > 0 || s.shoot_days.length > 0) && (
        <section className="rounded-lg bg-white p-4">
          <h3 className="mb-2 text-sm font-bold">Planning</h3>
          <ul className="flex flex-col gap-2 text-sm">
            {[...s.shoot_days.map((d) => ({ date: d.date, title: `Draaidag${d.location ? ` — ${d.location}` : ""}${d.start_time ? ` (${formatTime(d.start_time)})` : ""}` })), ...s.milestones]
              .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"))
              .map((m, i) => (
                <li key={i} className="flex gap-3">
                  <CalendarDays className="mt-0.5 size-4 shrink-0 text-zinc-500" aria-hidden />
                  <span className="w-28 shrink-0 font-semibold">{m.date ? formatDate(m.date, { weekday: true }) : "Nog te plannen"}</span>
                  <span>{m.title}</span>
                </li>
              ))}
          </ul>
        </section>
      )}
      {s.deliverables.length > 0 && (
        <section className="rounded-lg bg-white p-4">
          <h3 className="mb-2 text-sm font-bold">Video&apos;s</h3>
          <ul className="divide-y divide-zinc-100">
            {s.deliverables.map((d, i) => (
              <li key={i} className="flex flex-col gap-1 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{d.name}</span>
                  <Badge tone={d.status_label === "Wacht op jullie feedback" ? "warn" : d.status_label === "Goedgekeurd" || d.status_label === "Opgeleverd" ? "ok" : "neutral"}>{d.status_label}</Badge>
                  {d.planned_delivery_date && <span className="text-zinc-600">oplevering {formatDate(d.planned_delivery_date)}</span>}
                </div>
                {d.review_url && (
                  <a href={d.review_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold underline">
                    Bekijk versie {d.version_number} en geef feedback in Vimeo <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                )}
                {d.final_links.map((l, j) => (
                  <a key={j} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">
                    <Download className="size-3.5" aria-hidden /> {l.label}
                  </a>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-xs text-zinc-500">Feedback geef je in Vimeo. Vragen? Neem contact op met Studio Brutaal.</p>
    </article>
  );
}
