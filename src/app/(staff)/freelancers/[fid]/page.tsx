import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { formatDate, todayISO } from "@/lib/domain/dates";
import type { Freelancer } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { BookingBadge } from "@/components/status";
import { ActionButton } from "@/components/action-button";
import { FreelancerForm } from "../form";
import { deleteFreelancer, updateFreelancer } from "../actions";
import type { BookingStatus } from "@/lib/domain/labels";

export default async function FreelancerPage({ params }: { params: Promise<{ fid: string }> }) {
  const { fid } = await params;
  const s = await requireStaff();
  if (!/^[0-9a-f-]{36}$/i.test(fid)) notFound();
  const { data } = await s.supabase.from("freelancers").select("*").eq("id", fid).maybeSingle();
  if (!data) notFound();
  const f = data as Freelancer;
  const today = todayISO();
  const [{ data: bookings }, { data: overlaps }] = await Promise.all([
    s.supabase.from("bookings").select("id, project_id, role, status, work_description, projects(name, phase), booking_shoot_days(shoot_days(shoot_date))").eq("freelancer_id", fid),
    s.supabase.rpc("booking_overlaps"),
  ]);
  const ov = ((overlaps ?? []) as { freelancer_id: string; shoot_date: string }[]).filter((o) => o.freelancer_id === fid);
  type B = { id: string; project_id: string; role: string; status: BookingStatus; work_description: string; projects: { name: string } | null; booking_shoot_days: { shoot_days: { shoot_date: string } | null }[] };
  return (
    <>
      <Link href="/freelancers" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-ink">
        <ChevronLeft className="size-4" aria-hidden /> Freelancers
      </Link>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1>{f.name}</h1>
        {f.user_id ? <Badge tone="info">Gekoppeld account (beperkte toegang)</Badge> : <Badge>Geen account</Badge>}
      </div>
      {ov.map((o) => (
        <div key={o.shoot_date} className="mb-3">
          <Alert tone="warn" title="Mogelijke dubbele boeking">
            Bevestigd in meerdere projecten op {formatDate(o.shoot_date, { weekday: true, year: true })}. Er is geen garantie op beschikbaarheid; stem dit af.
          </Alert>
        </div>
      ))}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Gegevens" />
          <CardBody>
            <FreelancerForm action={updateFreelancer.bind(null, fid)} f={f} />
            {s.role === "owner" && (
              <ActionButton variant="ghost" size="sm" className="mt-3 text-red-800" action={deleteFreelancer.bind(null, fid)} confirm={`${f.name} verwijderen uit het register?`}>
                Verwijderen
              </ActionButton>
            )}
            <p className="mt-3 text-xs text-zinc-500">Een account koppelen doet de eigenaar via Instellingen → Gebruikers.</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Boekingen" />
          <CardBody>
            {(bookings ?? []).length === 0 ? (
              <EmptyState title="Nog geen boekingen" />
            ) : (
              <ul className="divide-y divide-zinc-100 text-sm">
                {((bookings ?? []) as unknown as B[]).map((b) => {
                  const dates = b.booking_shoot_days.map((x) => x.shoot_days?.shoot_date).filter((x): x is string => !!x).sort();
                  return (
                    <li key={b.id} className="py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/projecten/${b.project_id}/productie`} className="font-semibold hover:underline">
                          {b.projects?.name}
                        </Link>
                        <span className="text-zinc-600">{b.role}</span>
                        <BookingBadge status={b.status} />
                      </div>
                      <p className="text-xs text-zinc-600">{dates.length ? dates.map((d) => (d < today ? `(${formatDate(d)})` : formatDate(d, { weekday: true }))).join(", ") : "Geen draaidagen gekoppeld"}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
