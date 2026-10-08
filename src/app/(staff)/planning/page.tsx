import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { allProfiles } from "@/lib/data/overview";
import { fetchAll } from "@/lib/data/fetch-all";
import { addDays, formatDate, formatTime, isISODate, isoWeekNumber, todayISO, weekRange, weekdayName } from "@/lib/domain/dates";
import { isOpenStatus, type TaskStatus } from "@/lib/domain/labels";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TaskStatusBadge } from "@/components/status";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Planning" };

type SP = { week?: string; filter?: string };
type T = { id: string; project_id: string; title: string; status: TaskStatus; due_date: string | null; assignee_id: string | null; optional: boolean; shoot_day_id: string | null };

export default async function PlanningPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await requireStaff();
  const sp = await searchParams;
  const today = todayISO();
  const anchor = isISODate(sp.week) ? sp.week : today;
  const { start, end } = weekRange(anchor);
  const mine = sp.filter === "mijn";
  const overdueOnly = sp.filter === "achterstallig";

  const { data: projects } = await s.supabase.from("projects").select("id, name, deadline, phase").is("archived_at", null).not("phase", "in", "(afgerond,verloren)");
  const pids = (projects ?? []).map((p) => p.id);
  const pName = new Map((projects ?? []).map((p) => [p.id, p.name]));
  const [days, tasks, deliverables, names, bsd] = await Promise.all([
    pids.length ? fetchAll<{ id: string; project_id: string; shoot_date: string; start_time: string | null; end_time: string | null; location: string; callsheet_url: string | null }>((a, b) =>
      s.supabase.from("shoot_days").select("id, project_id, shoot_date, start_time, end_time, location, callsheet_url").in("project_id", pids).gte("shoot_date", start).lte("shoot_date", end).order("shoot_date").range(a, b),
    ) : [],
    pids.length ? fetchAll<T>((a, b) => {
      let q = s.supabase.from("tasks").select("id, project_id, title, status, due_date, assignee_id, optional, shoot_day_id").in("project_id", pids).not("status", "in", "(klaar,nvt)");
      q = overdueOnly ? q.lt("due_date", today).eq("optional", false) : q.gte("due_date", start).lte("due_date", end);
      if (mine) q = q.eq("assignee_id", s.userId);
      return q.order("due_date").range(a, b);
    }) : [],
    pids.length ? s.supabase.from("deliverables").select("id, project_id, name, planned_delivery_date").in("project_id", pids).is("delivered_on", null).gte("planned_delivery_date", start).lte("planned_delivery_date", end).then((r) => r.data ?? []) : [],
    allProfiles(s.supabase),
    s.supabase.from("booking_shoot_days").select("shoot_day_id, bookings(status, role, freelancers(name))").then((r) => r.data ?? []),
  ]);
  const crewByDay = new Map<string, { status: string; role: string; name: string }[]>();
  for (const r of bsd as unknown as { shoot_day_id: string; bookings: { status: string; role: string; freelancers: { name: string } | null } | null }[]) {
    if (!r.bookings || r.bookings.status === "geannuleerd") continue;
    crewByDay.set(r.shoot_day_id, [...(crewByDay.get(r.shoot_day_id) ?? []), { status: r.bookings.status, role: r.bookings.role, name: r.bookings.freelancers?.name ?? "" }]);
  }
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const filterLink = (f?: string) => `/planning?${new URLSearchParams({ ...(sp.week ? { week: sp.week } : {}), ...(f ? { filter: f } : {}) })}`;

  return (
    <>
      <PageHeader
        title="Planning"
        description={overdueOnly ? "Achterstallige taken (niet-optioneel)" : `Week ${isoWeekNumber(start)} · ${formatDate(start)} – ${formatDate(end, { year: true })}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/planning?week=${addDays(start, -7)}${mine ? "&filter=mijn" : ""}`} aria-label="Vorige week">
                <ChevronLeft aria-hidden /> Vorige
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/planning${mine ? "?filter=mijn" : ""}`}>Deze week</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/planning?week=${addDays(start, 7)}${mine ? "&filter=mijn" : ""}`} aria-label="Volgende week">
                Volgende <ChevronRight aria-hidden />
              </Link>
            </Button>
          </div>
        }
      />
      <nav aria-label="Filter" className="mb-4 flex gap-3 text-sm font-semibold">
        {[
          [undefined, "Alles"],
          ["mijn", "Mijn taken"],
          ["achterstallig", "Achterstallig"],
        ].map(([f, label]) => (
          <Link key={label} href={filterLink(f)} aria-current={sp.filter === f ? "true" : undefined} className={cn(sp.filter === f && "underline decoration-brand decoration-4 underline-offset-4")}>
            {label}
          </Link>
        ))}
      </nav>

      {overdueOnly ? (
        <Card>
          {tasks.length === 0 ? (
            <div className="p-4">
              <EmptyState title="Geen achterstallige taken" />
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {tasks.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                  <span className="w-24 font-semibold text-red-800">{formatDate(t.due_date)}</span>
                  <Link href={`/projecten/${t.project_id}/taken/${t.id}`} className="font-semibold hover:underline">
                    {t.title}
                  </Link>
                  <span className="text-zinc-600">{pName.get(t.project_id)}</span>
                  <span className="text-zinc-600">· {names.get(t.assignee_id ?? "") ?? "niet toegewezen"}</span>
                  <TaskStatusBadge status={t.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-7">
          {weekDays.map((d) => {
            const dShoots = days.filter((x) => x.shoot_date === d);
            const dTasks = tasks.filter((t) => t.due_date === d);
            const dDeadlines = (projects ?? []).filter((p) => p.deadline === d);
            const dDeliv = deliverables.filter((x) => x.planned_delivery_date === d);
            const empty = !dShoots.length && !dTasks.length && !dDeadlines.length && !dDeliv.length;
            return (
              <section key={d} aria-label={`${weekdayName(d)} ${formatDate(d)}`} className={cn("rounded-lg border bg-white", d === today ? "border-ink ring-2 ring-brand" : "border-zinc-200", d > end && "opacity-60")}>
                <h2 className="flex items-baseline justify-between border-b border-zinc-100 px-3 py-2 text-sm">
                  <span className="capitalize">{weekdayName(d)}</span>
                  <span className="font-normal text-zinc-600">{formatDate(d)}</span>
                </h2>
                <div className="flex flex-col gap-2 p-2 text-sm">
                  {empty && <p className="px-1 text-xs text-zinc-400">Niets gepland</p>}
                  {dShoots.map((x) => {
                    const crew = crewByDay.get(x.id) ?? [];
                    const open = crew.filter((c) => c.status !== "bevestigd").length;
                    return (
                      <Link key={x.id} href={`/projecten/${x.project_id}/productie`} className="block rounded-md bg-ink p-2 text-white hover:bg-ink-soft">
                        <Badge tone="brand">Draaidag</Badge>
                        <p className="mt-1 font-semibold">{pName.get(x.project_id)}</p>
                        <p className="text-xs text-zinc-300">
                          {x.start_time ? `${formatTime(x.start_time)}–${formatTime(x.end_time)} · ` : ""}
                          {x.location || "locatie onbekend"}
                        </p>
                        <p className="text-xs text-zinc-300">
                          {crew.length} crew{open > 0 ? `, ${open} onbevestigd` : ""}
                          {!x.callsheet_url && " · geen callsheet"}
                        </p>
                      </Link>
                    );
                  })}
                  {dDeadlines.map((p) => (
                    <Link key={p.id} href={`/projecten/${p.id}`} className="block rounded-md border border-red-200 bg-red-50 p-2 hover:border-red-400">
                      <Badge tone="danger">Projectdeadline</Badge>
                      <p className="mt-1 font-semibold">{p.name}</p>
                    </Link>
                  ))}
                  {dDeliv.map((x) => (
                    <Link key={x.id} href={`/projecten/${x.project_id}/deliverables`} className="block rounded-md border border-sky-200 bg-sky-50 p-2 hover:border-sky-400">
                      <Badge tone="info">Oplevering</Badge>
                      <p className="mt-1 font-semibold">{x.name}</p>
                      <p className="text-xs text-zinc-600">{pName.get(x.project_id)}</p>
                    </Link>
                  ))}
                  {dTasks.map((t) => (
                    <Link key={t.id} href={`/projecten/${t.project_id}/taken/${t.id}`} className={cn("block rounded-md border border-zinc-200 p-2 hover:border-ink", t.optional && "opacity-70")}>
                      <p className={cn("font-semibold", !isOpenStatus(t.status) && "line-through")}>{t.title}</p>
                      <p className="text-xs text-zinc-600">
                        {pName.get(t.project_id)} · {names.get(t.assignee_id ?? "") ?? "niet toegewezen"}
                        {t.optional && " · optioneel"}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
