import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Clapperboard, Hourglass, ListTodo, Plus, TriangleAlert } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { loadOverview } from "@/lib/data/overview";
import {
  applyFilters,
  buildRows,
  kpis as computeKpis,
  myActions,
  sortRows,
  waitingList,
  weekAgenda,
  type DashboardFilters,
  type ProjectRow,
  type SortKey,
} from "@/lib/domain/dashboard";
import { formatDate, isoWeekNumber, relativeDay, todayISO, weekdayName } from "@/lib/domain/dates";
import { ACTIVE_PHASES, PHASE_LABELS } from "@/lib/domain/labels";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, Td, Th } from "@/components/ui/table";
import { AttentionCell, HealthBadge, PhaseBadge } from "@/components/status";
import { Select, Label } from "@/components/ui/input";
import { saveDashboardPrefs } from "./actions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

type SP = Record<string, string | undefined>;

export default async function Dashboard({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await requireStaff();
  const sp = await searchParams;
  const today = todayISO();
  const [data, { data: pref }] = await Promise.all([
    loadOverview(s.supabase),
    s.supabase.from("user_preferences").select("value").eq("user_id", s.userId).eq("key", "dashboard").maybeSingle(),
  ]);
  const prefs = (pref?.value ?? {}) as { view?: "tabel" | "bord"; sort?: SortKey };
  const view = prefs.view ?? "tabel";
  const sort = prefs.sort ?? "aandacht";

  const clientNames = new Map(data.clients.map((c) => [c.id, c.name]));
  const staffNames = new Map(data.staff.map((p) => [p.id, p.full_name]));
  const all = buildRows(data.projects, data.tasks, data.shootDays, clientNames, today);
  const filters: DashboardFilters = {
    fase: sp.fase,
    klant: sp.klant,
    verantwoordelijke: sp.verantwoordelijke,
    merk: sp.merk,
    deadline: sp.deadline as DashboardFilters["deadline"],
    wacht: sp.wacht as DashboardFilters["wacht"],
  };
  const rows = sortRows(applyFilters(all, filters, today), sort);
  const k = computeKpis(all, data.tasks, today);
  const agenda = weekAgenda(all, data.tasks, data.shootDays, data.deliverables, today);
  const mine = myActions(all, data.tasks, s.userId, today);
  const waitingClient = waitingList(all, data.tasks, "wacht_klant", today);
  const waitingExtern = waitingList(all, data.tasks, "wacht_extern", today);
  const withoutNext = all.filter((r) => r.nextAction.missing || r.nextAction.needsUpdate);
  const filtered = Object.values(filters).some(Boolean);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${weekdayName(today)} ${formatDate(today, { year: true })} · week ${isoWeekNumber(today)}`}
        actions={
          <Button asChild>
            <Link href="/projecten/nieuw">
              <Plus aria-hidden /> Nieuw project
            </Link>
          </Button>
        }
      />

      <section aria-label="Kerncijfers" className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Actieve projecten" value={k.active} href="/" icon={<Clapperboard aria-hidden />} />
        <Kpi label="Aandacht nodig" value={k.attention} href="#overzicht" icon={<TriangleAlert aria-hidden />} warn={k.attention > 0} />
        <Kpi label="Achterstallige taken" value={k.overdueTasks} href="/planning?filter=achterstallig" icon={<ListTodo aria-hidden />} warn={k.overdueTasks > 0} />
        <Kpi label="Wacht op klant" value={k.waitingClient} href="/?wacht=klant#overzicht" icon={<Hourglass aria-hidden />} />
      </section>

      <div className="mb-5 grid gap-4 md:grid-cols-3">
          <Block title="Mijn acties vandaag" count={mine.length}>
            {mine.length === 0 ? (
              <Empty>Niets op jouw naam voor vandaag.</Empty>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {mine.map((a) => (
                  <li key={a.kind + a.id} className="py-2">
                    <Link href={`/projecten/${a.projectId}${a.kind === "task" ? `/taken/${a.id}` : ""}`} className="font-semibold hover:underline">
                      {a.title}
                    </Link>
                    <p className="text-xs text-zinc-600">
                      {a.projectName}
                      {a.date && <DateNote date={a.date} today={today} />}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Block>
          <Block title="Deadlines deze week" count={agenda.deadlines.length}>
            {agenda.deadlines.length === 0 ? (
              <Empty>Geen deadlines deze week.</Empty>
            ) : (
              <AgendaList items={agenda.deadlines} today={today} />
            )}
          </Block>
          <Block title="Draaidagen deze week" count={agenda.shoots.length} icon={<CalendarDays className="size-4" aria-hidden />}>
            {agenda.shoots.length === 0 ? <Empty>Geen draaidagen deze week.</Empty> : <AgendaList items={agenda.shoots} today={today} />}
          </Block>
      </div>

          <Card id="overzicht" className="mb-5">
            <CardHeader
              title="Projecten"
              description={`${rows.length} van ${all.length} lopende projecten${filtered ? " (gefilterd)" : ""}`}
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <form action={saveDashboardPrefs} className="flex items-center gap-1" aria-label="Weergave">
                    <ToggleButton name="view" value="tabel" active={view === "tabel"} label="Tabel" />
                    <ToggleButton name="view" value="bord" active={view === "bord"} label="Bord per fase" />
                  </form>
                  {view === "tabel" && (
                    <form action={saveDashboardPrefs} className="flex items-center gap-1">
                      <Label htmlFor="sort" className="sr-only">
                        Sorteren
                      </Label>
                      <Select id="sort" name="sort" defaultValue={sort} className="h-8 w-auto text-xs">
                        <option value="aandacht">Sorteer: aandacht</option>
                        <option value="deadline">Sorteer: deadline</option>
                        <option value="actie">Sorteer: datum volgende actie</option>
                        <option value="fase">Sorteer: fase</option>
                        <option value="naam">Sorteer: naam</option>
                      </Select>
                      <Button size="sm" variant="outline">
                        Toepassen
                      </Button>
                    </form>
                  )}
                </div>
              }
            />
            <Filters sp={sp} clients={data.clients} staff={data.staff} brands={data.brands} />
            {rows.length === 0 ? (
              <CardBody>
                <EmptyState title={filtered ? "Geen projecten met deze filters" : "Nog geen lopende projecten"}>
                  {filtered ? <Link href="/" className="underline">Filters wissen</Link> : <Link href="/projecten/nieuw" className="underline">Maak het eerste project</Link>}
                </EmptyState>
              </CardBody>
            ) : view === "bord" ? (
              <Board rows={rows} staffNames={staffNames} today={today} />
            ) : (
              <ProjectTable rows={rows} staffNames={staffNames} today={today} />
            )}
          </Card>

      <div className="grid gap-4 md:grid-cols-3">
          <Block title="Wachten op klant" count={waitingClient.length}>
            <WaitingItems items={waitingClient} />
          </Block>
          <Block title="Wachten op freelancer / leverancier" count={waitingExtern.length}>
            <WaitingItems items={waitingExtern} />
          </Block>
          <Block title="Zonder eerstvolgende actie" count={withoutNext.length}>
            {withoutNext.length === 0 ? (
              <Empty>Elk project heeft een volgende actie.</Empty>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {withoutNext.map((r) => (
                  <li key={r.project.id} className="py-2">
                    <Link href={`/projecten/${r.project.id}#volgende-actie`} className="font-semibold hover:underline">
                      {r.project.name}
                    </Link>
                    <p className="text-xs text-zinc-600">{r.nextAction.needsUpdate ? "Vorige actie afgerond — kies een nieuwe" : `${r.clientName} · ${PHASE_LABELS[r.project.phase]}`}</p>
                  </li>
                ))}
              </ul>
            )}
          </Block>
      </div>
    </>
  );
}

function Kpi({ label, value, href, icon, warn }: { label: string; value: number; href: string; icon: React.ReactNode; warn?: boolean }) {
  return (
    <Link href={href} className={cn("rounded-lg border bg-white p-4 hover:border-ink [&_svg]:size-5", warn ? "border-amber-300" : "border-zinc-200")}>
      <div className="flex items-center justify-between text-zinc-500">
        <span className="text-sm font-semibold text-zinc-700">{label}</span>
        {icon}
      </div>
      <p className="mt-1 font-heading text-3xl font-extrabold">{value}</p>
    </Link>
  );
}

function ToggleButton({ name, value, active, label }: { name: string; value: string; active: boolean; label: string }) {
  return (
    <button
      name={name}
      value={value}
      aria-pressed={active}
      className={cn("h-8 rounded-md border px-3 text-xs font-semibold", active ? "border-ink bg-ink text-white" : "border-zinc-300 bg-white hover:bg-zinc-100")}
    >
      {label}
    </button>
  );
}

function Filters({ sp, clients, staff, brands }: { sp: SP; clients: { id: string; name: string }[]; staff: { id: string; full_name: string }[]; brands: { id: string; name: string }[] }) {
  return (
    <form method="get" className="grid grid-cols-2 gap-2 border-b border-zinc-100 px-4 py-3 sm:grid-cols-3 lg:grid-cols-7" aria-label="Filters">
      <FilterSelect id="f-fase" name="fase" label="Fase" value={sp.fase} options={ACTIVE_PHASES.map((p) => [p, PHASE_LABELS[p]])} />
      <FilterSelect id="f-klant" name="klant" label="Klant" value={sp.klant} options={clients.map((c) => [c.id, c.name])} />
      <FilterSelect id="f-ver" name="verantwoordelijke" label="Verantwoordelijke" value={sp.verantwoordelijke} options={staff.map((p) => [p.id, p.full_name])} />
      <FilterSelect id="f-merk" name="merk" label="Merk" value={sp.merk} options={brands.map((b) => [b.id, b.name])} />
      <FilterSelect
        id="f-deadline"
        name="deadline"
        label="Deadline"
        value={sp.deadline}
        options={[
          ["verstreken", "Verstreken"],
          ["deze_week", "Deze week"],
          ["deze_maand", "Komende 31 dagen"],
          ["geen", "Geen deadline"],
        ]}
      />
      <FilterSelect
        id="f-wacht"
        name="wacht"
        label="Wachtstatus"
        value={sp.wacht}
        options={[
          ["klant", "Wacht op klant"],
          ["extern", "Wacht op freelancer / leverancier"],
          ["geen", "Wacht nergens op"],
        ]}
      />
      <div className="col-span-2 flex items-end gap-2 sm:col-span-1">
        <Button size="sm" variant="dark" className="h-9">
          Filter
        </Button>
        <Link href="/" className="pb-2 text-xs font-semibold underline">
          Wissen
        </Link>
      </div>
    </form>
  );
}

function FilterSelect({ id, name, label, value, options }: { id: string; name: string; label: string; value?: string; options: [string, string][] }) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Select id={id} name={name} defaultValue={value ?? ""}>
        <option value="">Alle</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Select>
    </div>
  );
}

function NextActionCell({ r, staffNames, today }: { r: ProjectRow; staffNames: Map<string, string>; today: string }) {
  const na = r.nextAction;
  if (na.missing || na.needsUpdate)
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-amber-800">
        <TriangleAlert className="size-4" aria-hidden />
        {na.needsUpdate ? "Kies nieuwe actie" : "Geen volgende actie"}
      </span>
    );
  return (
    <div>
      <p className="font-semibold">{na.label}</p>
      <p className="text-xs text-zinc-600">
        {(na.assigneeId && staffNames.get(na.assigneeId)) || "Niemand toegewezen"}
        {na.date && <DateNote date={na.date} today={today} />}
      </p>
    </div>
  );
}

function ProjectTable({ rows, staffNames, today }: { rows: ProjectRow[]; staffNames: Map<string, string>; today: string }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Project</Th>
          <Th>Fase</Th>
          <Th>Eerstvolgende actie</Th>
          <Th>Deadline</Th>
          <Th>Volgende draaidag</Th>
          <Th>Status</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.project.id} className="hover:bg-zinc-50">
            <Td className="min-w-48">
              <Link href={`/projecten/${r.project.id}`} className="font-heading font-bold hover:underline">
                {r.project.name}
              </Link>
              <p className="text-xs text-zinc-600">{r.clientName}</p>
            </Td>
            <Td>
              <PhaseBadge phase={r.project.phase} />
            </Td>
            <Td className="min-w-56">
              <NextActionCell r={r} staffNames={staffNames} today={today} />
            </Td>
            <Td className="whitespace-nowrap">
              {r.project.deadline ? (
                <span className={r.project.deadline < today ? "font-semibold text-red-800" : ""}>{formatDate(r.project.deadline)}</span>
              ) : (
                <span className="text-zinc-500">—</span>
              )}
            </Td>
            <Td className="whitespace-nowrap">{r.nextShootDate ? formatDate(r.nextShootDate, { weekday: true }) : <span className="text-zinc-500">—</span>}</Td>
            <Td className="min-w-48">
              <AttentionCell level={r.attention.level} reasons={r.attention.reasons} />
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function Board({ rows, staffNames, today }: { rows: ProjectRow[]; staffNames: Map<string, string>; today: string }) {
  return (
    <div className="flex gap-3 overflow-x-auto p-4">
      {ACTIVE_PHASES.map((phase) => {
        const col = rows.filter((r) => r.project.phase === phase);
        return (
          <section key={phase} aria-label={PHASE_LABELS[phase]} className="w-64 shrink-0 rounded-md bg-zinc-100 p-2">
            <h3 className="mb-2 flex items-center justify-between px-1 text-sm font-bold">
              {PHASE_LABELS[phase]} <span className="text-zinc-500">{col.length}</span>
            </h3>
            <ul className="flex flex-col gap-2">
              {col.map((r) => (
                <li key={r.project.id} className="rounded-md border border-zinc-200 bg-white p-3">
                  <Link href={`/projecten/${r.project.id}`} className="font-heading font-bold hover:underline">
                    {r.project.name}
                  </Link>
                  <p className="mb-2 text-xs text-zinc-600">{r.clientName}</p>
                  <div className="mb-2 text-sm">
                    <NextActionCell r={r} staffNames={staffNames} today={today} />
                  </div>
                  <HealthBadge level={r.attention.level} title={r.attention.reasons.join("; ")} />
                  {r.attention.reasons[0] && <p className="mt-1 text-xs text-zinc-600">{r.attention.reasons[0]}</p>}
                </li>
              ))}
              {col.length === 0 && <li className="px-1 text-xs text-zinc-500">Geen projecten</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Block({ title, count, children, icon }: { title: string; count: number; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          {icon}
          {title}
        </h2>
        <span className="rounded bg-zinc-100 px-2 text-xs font-bold">{count}</span>
      </div>
      <div className="max-h-72 overflow-y-auto px-4 py-1 text-sm">{children}</div>
    </Card>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="py-3 text-sm text-zinc-500">{children}</p>;

function DateNote({ date, today }: { date: string; today: string }) {
  const late = date < today;
  return <span className={late ? "font-semibold text-red-800" : ""}> · {relativeDay(date, today)}</span>;
}

function AgendaList({ items, today }: { items: { date: string; label: string; projectId: string; projectName: string; detail?: string }[]; today: string }) {
  return (
    <ul className="divide-y divide-zinc-100">
      {items.map((i, idx) => (
        <li key={idx} className="flex gap-3 py-2">
          <span className={cn("w-14 shrink-0 text-xs font-bold uppercase", i.date === today && "text-ink underline decoration-brand decoration-2")}>{formatDate(i.date, { weekday: true })}</span>
          <div className="min-w-0">
            <Link href={`/projecten/${i.projectId}`} className="font-semibold hover:underline">
              {i.projectName}
            </Link>
            <p className="text-xs text-zinc-600">
              {i.label}
              {i.detail && ` · ${i.detail}`}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function WaitingItems({ items }: { items: { taskId: string; title: string; projectId: string; projectName: string; workdays: number | null }[] }) {
  if (items.length === 0) return <Empty>Nergens op aan het wachten.</Empty>;
  return (
    <ul className="divide-y divide-zinc-100">
      {items.map((w) => (
        <li key={w.taskId} className="py-2">
          <Link href={`/projecten/${w.projectId}/taken/${w.taskId}`} className="font-semibold hover:underline">
            {w.projectName}
          </Link>
          <p className="text-xs text-zinc-600">
            {w.title}
            {w.workdays !== null && (
              <span className={w.workdays >= 3 ? "font-semibold text-amber-800" : ""}> · sinds {w.workdays} {w.workdays === 1 ? "werkdag" : "werkdagen"}</span>
            )}
          </p>
        </li>
      ))}
    </ul>
  );
}
