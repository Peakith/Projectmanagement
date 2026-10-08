import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { getProject } from "@/lib/data/project";
import { formatDate, formatTime, todayISO } from "@/lib/domain/dates";
import { BOOKING_STATUSES, BOOKING_STATUS_LABELS, DEFAULT_CREW_ROLES, isOpenStatus } from "@/lib/domain/labels";
import type { Booking, ShootDay, Task } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/misc";
import { BookingBadge, TaskStatusBadge } from "@/components/status";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ActionButton } from "@/components/action-button";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { addBooking, addShootDay, deleteBooking, deleteShootDay, updateBooking, updateShootDay } from "../_actions/production";

export default async function ProductionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { s } = await getProject(id);
  const db = s.supabase;
  const today = todayISO();
  const [{ data: days }, { data: bookings }, { data: links }, { data: freelancers }, { data: tasks }, { data: overlaps }] = await Promise.all([
    db.from("shoot_days").select("*").eq("project_id", id).order("shoot_date"),
    db.from("bookings").select("*").eq("project_id", id).order("created_at"),
    db.from("booking_shoot_days").select("booking_id, shoot_day_id, bookings!inner(project_id)").eq("bookings.project_id", id),
    db.from("freelancers").select("id, name, specialisms, user_id, phone, email").eq("active", true).order("name"),
    db.from("tasks").select("id, title, status, shoot_day_id, due_date").eq("project_id", id).not("shoot_day_id", "is", null).order("sort"),
    db.rpc("booking_overlaps"),
  ]);
  const shootDays = (days ?? []) as ShootDay[];
  const bks = (bookings ?? []) as Booking[];
  const fMap = new Map((freelancers ?? []).map((f) => [f.id, f]));
  const daysByBooking = new Map<string, string[]>();
  for (const l of links ?? []) daysByBooking.set(l.booking_id, [...(daysByBooking.get(l.booking_id) ?? []), l.shoot_day_id]);
  const bookingIds = new Set(bks.map((b) => b.id));
  const myOverlaps = ((overlaps ?? []) as { freelancer_name: string; shoot_date: string; booking_ids: string[]; project_ids: string[] }[]).filter((o) =>
    o.booking_ids.some((b) => bookingIds.has(b)),
  );

  return (
    <div className="flex flex-col gap-5">
      {myOverlaps.map((o) => (
        <Alert key={o.freelancer_name + o.shoot_date} tone="warn" title="Mogelijke dubbele boeking">
          {o.freelancer_name} is op {formatDate(o.shoot_date, { weekday: true, year: true })} bevestigd in {o.project_ids.length} projecten. Controleer de planning; het systeem garandeert geen beschikbaarheid.
        </Alert>
      ))}

      <section aria-labelledby="draaidagen-kop" className="flex flex-col gap-4">
        <h2 id="draaidagen-kop">Draaidagen ({shootDays.length})</h2>
        {shootDays.length === 0 && <EmptyState title="Nog geen draaidagen">Voeg een draaidag toe; de productietaken per draaidag worden automatisch gekoppeld.</EmptyState>}
        {shootDays.map((d) => {
          const dayTasks = ((tasks ?? []) as Pick<Task, "id" | "title" | "status" | "shoot_day_id" | "due_date">[]).filter((t) => t.shoot_day_id === d.id);
          const crew = bks.filter((b) => (daysByBooking.get(b.id) ?? []).includes(d.id) && b.status !== "geannuleerd");
          const unconfirmed = crew.filter((b) => b.status !== "bevestigd").length;
          return (
            <Card key={d.id}>
              <CardHeader
                as="h3"
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {formatDate(d.shoot_date, { weekday: true, year: true })}
                    {d.shoot_date < today && <Badge>Geweest</Badge>}
                    {d.shoot_date === today && <Badge tone="brand">Vandaag</Badge>}
                  </span>
                }
                description={[d.start_time && `${formatTime(d.start_time)}–${formatTime(d.end_time)}`, d.location, d.address].filter(Boolean).join(" · ") || "Tijd en locatie nog niet ingevuld"}
                action={
                  d.callsheet_url ? (
                    <a href={d.callsheet_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold underline">
                      Callsheet <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  ) : (
                    <Badge tone="warn">Geen callsheet</Badge>
                  )
                }
              />
              <CardBody className="grid gap-5 lg:grid-cols-3">
                <div className="text-sm">
                  <h4 className="mb-1 font-bold">Crew</h4>
                  {crew.length === 0 ? (
                    <p className="text-amber-800">Nog geen crew gekoppeld.</p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {crew.map((b) => (
                        <li key={b.id} className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{fMap.get(b.freelancer_id)?.name}</span>
                          <span className="text-zinc-600">{b.role}</span>
                          <BookingBadge status={b.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                  {unconfirmed > 0 && <p className="mt-1 text-xs font-semibold text-amber-800">{unconfirmed} nog niet bevestigd</p>}
                  {d.schedule && (
                    <>
                      <h4 className="mb-1 mt-3 font-bold">Planning</h4>
                      <p className="whitespace-pre-wrap text-zinc-700">{d.schedule}</p>
                    </>
                  )}
                </div>
                <div className="text-sm">
                  <h4 className="mb-1 font-bold">Werkzaamheden voor deze draaidag</h4>
                  {dayTasks.length === 0 ? (
                    <p className="text-zinc-600">Geen gekoppelde taken.</p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {dayTasks.map((t) => (
                        <li key={t.id} className="flex items-start justify-between gap-2">
                          <Link href={`/projecten/${id}/taken/${t.id}`} className={`hover:underline ${isOpenStatus(t.status) ? "" : "text-zinc-500 line-through"}`}>
                            {t.title.replace(/ — draaidag .*$/, "")}
                          </Link>
                          <TaskStatusBadge status={t.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <details className="text-sm">
                  <summary className="cursor-pointer font-semibold">Draaidag bewerken</summary>
                  <ActionForm action={updateShootDay.bind(null, id, d.id)} className="mt-3 grid grid-cols-2 gap-3">
                    <Field label="Datum" htmlFor={`sd-date-${d.id}`} className="col-span-2" hint="Verplaatsen? Daarna verschijnt een voorstel voor gekoppelde taakdatums.">
                      <Input id={`sd-date-${d.id}`} name="shoot_date" type="date" defaultValue={d.shoot_date} required />
                    </Field>
                    <Field label="Start" htmlFor={`sd-start-${d.id}`}>
                      <Input id={`sd-start-${d.id}`} name="start_time" type="time" defaultValue={d.start_time?.slice(0, 5) ?? ""} />
                    </Field>
                    <Field label="Einde" htmlFor={`sd-end-${d.id}`}>
                      <Input id={`sd-end-${d.id}`} name="end_time" type="time" defaultValue={d.end_time?.slice(0, 5) ?? ""} />
                    </Field>
                    <Field label="Locatie" htmlFor={`sd-loc-${d.id}`} className="col-span-2">
                      <Input id={`sd-loc-${d.id}`} name="location" defaultValue={d.location} maxLength={200} />
                    </Field>
                    <Field label="Adres" htmlFor={`sd-addr-${d.id}`} className="col-span-2">
                      <Input id={`sd-addr-${d.id}`} name="address" defaultValue={d.address} maxLength={300} />
                    </Field>
                    <Field label="Dagplanning" htmlFor={`sd-sched-${d.id}`} className="col-span-2">
                      <Textarea id={`sd-sched-${d.id}`} name="schedule" defaultValue={d.schedule} maxLength={5000} />
                    </Field>
                    <Field label="Callsheet-link" htmlFor={`sd-cs-${d.id}`} className="col-span-2">
                      <Input id={`sd-cs-${d.id}`} name="callsheet_url" type="url" defaultValue={d.callsheet_url ?? ""} placeholder="https://" />
                    </Field>
                    <Field label="Notities voor crew" htmlFor={`sd-crew-${d.id}`} className="col-span-2" hint="Zichtbaar voor geboekte freelancers met account.">
                      <Textarea id={`sd-crew-${d.id}`} name="crew_notes" defaultValue={d.crew_notes} maxLength={3000} />
                    </Field>
                    <Field label="Interne notities" htmlFor={`sd-int-${d.id}`} className="col-span-2">
                      <Textarea id={`sd-int-${d.id}`} name="internal_notes" defaultValue={d.internal_notes} maxLength={3000} />
                    </Field>
                    <div className="col-span-2 flex flex-wrap gap-2">
                      <SubmitButton size="sm">Opslaan</SubmitButton>
                      <ActionButton size="sm" variant="outline" className="text-red-800" action={deleteShootDay.bind(null, id, d.id)} confirm="Draaidag verwijderen? Open taken die voor deze draaidag zijn aangemaakt worden ook verwijderd.">
                        Verwijderen
                      </ActionButton>
                    </div>
                  </ActionForm>
                </details>
              </CardBody>
            </Card>
          );
        })}
        <Card>
          <CardHeader as="h3" title="Draaidag toevoegen" />
          <CardBody>
            <ActionForm action={addShootDay.bind(null, id)} success="Draaidag toegevoegd" resetOnSuccess className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Field label="Datum" htmlFor="nsd-date" required>
                <Input id="nsd-date" name="shoot_date" type="date" required />
              </Field>
              <Field label="Start" htmlFor="nsd-start">
                <Input id="nsd-start" name="start_time" type="time" />
              </Field>
              <Field label="Einde" htmlFor="nsd-end">
                <Input id="nsd-end" name="end_time" type="time" />
              </Field>
              <Field label="Locatie" htmlFor="nsd-loc">
                <Input id="nsd-loc" name="location" maxLength={200} />
              </Field>
              <Field label="Adres" htmlFor="nsd-addr">
                <Input id="nsd-addr" name="address" maxLength={300} />
              </Field>
              <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-5">
                <Checkbox name="with_tasks" defaultChecked /> Productietaken voor deze draaidag aanmaken (uit de templateversie van dit project)
              </label>
              <div>
                <SubmitButton size="sm">Toevoegen</SubmitButton>
              </div>
            </ActionForm>
          </CardBody>
        </Card>
      </section>

      <section aria-labelledby="crew-kop" className="flex flex-col gap-4">
        <h2 id="crew-kop">Crew en boekingen</h2>
        <p className="-mt-2 text-sm text-zinc-600">Tarieven en financiële afspraken staan alleen in het afgeschermde financiële deel van de eigenaar.</p>
        {bks.length === 0 && <EmptyState title="Nog geen crew geboekt" />}
        {bks.map((b) => (
          <Card key={b.id}>
            <CardHeader
              as="h3"
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <Link href={`/freelancers/${b.freelancer_id}`} className="hover:underline">
                    {fMap.get(b.freelancer_id)?.name ?? "Onbekende freelancer"}
                  </Link>
                  <BookingBadge status={b.status} />
                  {!fMap.get(b.freelancer_id)?.user_id && <Badge>Geen account</Badge>}
                </span>
              }
              description={[b.role, (daysByBooking.get(b.id) ?? []).map((dd) => formatDate(shootDays.find((x) => x.id === dd)?.shoot_date)).join(", ")].filter(Boolean).join(" · ")}
            />
            <CardBody>
              <details>
                <summary className="cursor-pointer text-sm font-semibold">Boeking bewerken</summary>
                <BookingForm action={updateBooking.bind(null, id, b.id)} freelancers={freelancers ?? []} shootDays={shootDays} booking={b} selectedDays={daysByBooking.get(b.id) ?? []} />
                <ActionButton size="sm" variant="ghost" className="mt-2 text-red-800" action={deleteBooking.bind(null, id, b.id)} confirm="Boeking verwijderen?">
                  Boeking verwijderen
                </ActionButton>
              </details>
              {b.work_description && <p className="mt-2 text-sm">{b.work_description}</p>}
            </CardBody>
          </Card>
        ))}
        <Card>
          <CardHeader as="h3" title="Freelancer boeken" description="Een freelancer zonder account kan gewoon worden gekoppeld." />
          <CardBody>
            {(freelancers ?? []).length === 0 ? (
              <p className="text-sm">
                Voeg eerst een freelancer toe in het <Link href="/freelancers" className="underline">freelancerregister</Link>.
              </p>
            ) : (
              <BookingForm action={addBooking.bind(null, id)} freelancers={freelancers ?? []} shootDays={shootDays} reset />
            )}
          </CardBody>
        </Card>
      </section>
    </div>
  );
}

function BookingForm({
  action,
  freelancers,
  shootDays,
  booking,
  selectedDays = [],
  reset,
}: {
  action: Parameters<typeof ActionForm>[0]["action"];
  freelancers: { id: string; name: string; specialisms: string[] }[];
  shootDays: ShootDay[];
  booking?: Booking;
  selectedDays?: string[];
  reset?: boolean;
}) {
  const k = booking?.id ?? "new";
  return (
    <ActionForm action={action} resetOnSuccess={reset} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Freelancer" htmlFor={`b-fl-${k}`} required>
        <Select id={`b-fl-${k}`} name="freelancer_id" defaultValue={booking?.freelancer_id ?? ""} required>
          <option value="">Kies…</option>
          {freelancers.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
              {f.specialisms.length ? ` (${f.specialisms.join(", ")})` : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Rol" htmlFor={`b-role-${k}`}>
        <Input id={`b-role-${k}`} name="role" list="crew-roles" defaultValue={booking?.role ?? ""} maxLength={100} />
      </Field>
      <datalist id="crew-roles">
        {DEFAULT_CREW_ROLES.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      <Field label="Status" htmlFor={`b-status-${k}`}>
        <Select id={`b-status-${k}`} name="status" defaultValue={booking?.status ?? "benaderen"}>
          {BOOKING_STATUSES.map((st) => (
            <option key={st} value={st}>
              {BOOKING_STATUS_LABELS[st]}
            </option>
          ))}
        </Select>
      </Field>
      <fieldset className="text-sm">
        <legend className="mb-1.5 font-semibold">Draaidagen</legend>
        {shootDays.length === 0 ? (
          <p className="text-zinc-500">Geen draaidagen</p>
        ) : (
          shootDays.map((d) => (
            <label key={d.id} className="flex items-center gap-2">
              <Checkbox name="shoot_day_ids" value={d.id} defaultChecked={selectedDays.includes(d.id)} /> {formatDate(d.shoot_date, { weekday: true })}
            </label>
          ))
        )}
      </fieldset>
      <Field label="Werkzaamheden (gedeeld met freelancer)" htmlFor={`b-work-${k}`} className="sm:col-span-2">
        <Textarea id={`b-work-${k}`} name="work_description" defaultValue={booking?.work_description ?? ""} maxLength={2000} />
      </Field>
      <Field label="Interne notities (geen tarieven)" htmlFor={`b-int-${k}`} className="sm:col-span-2">
        <Textarea id={`b-int-${k}`} name="internal_notes" defaultValue={booking?.internal_notes ?? ""} maxLength={2000} />
      </Field>
      <div className="sm:col-span-2 lg:col-span-4">
        <SubmitButton size="sm">{booking ? "Opslaan" : "Boeken"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
