import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { AVAILABILITY_LABELS } from "@/lib/domain/labels";
import { formatDate, todayISO } from "@/lib/domain/dates";
import type { Freelancer } from "@/lib/types";
import { PageHeader, EmptyState, Alert } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, Td, Th } from "@/components/ui/table";
import { FreelancerForm } from "./form";
import { createFreelancer } from "./actions";

export const metadata: Metadata = { title: "Freelancers" };

export default async function FreelancersPage({ searchParams }: { searchParams: Promise<{ q?: string; rol?: string; inactief?: string }> }) {
  const s = await requireStaff();
  const sp = await searchParams;
  const today = todayISO();
  let q = s.supabase.from("freelancers").select("*").order("name");
  if (sp.inactief !== "1") q = q.eq("active", true);
  const [{ data }, { data: upcoming }, { data: overlaps }] = await Promise.all([
    q,
    s.supabase.from("booking_shoot_days").select("shoot_days!inner(shoot_date), bookings!inner(freelancer_id, status)").gte("shoot_days.shoot_date", today),
    s.supabase.rpc("booking_overlaps"),
  ]);
  const all = (data ?? []) as Freelancer[];
  const specs = [...new Set(all.flatMap((f) => f.specialisms))].sort();
  const term = (sp.q ?? "").toLowerCase();
  const rows = all.filter((f) => (!term || f.name.toLowerCase().includes(term) || f.city.toLowerCase().includes(term)) && (!sp.rol || f.specialisms.includes(sp.rol)));
  const nextDate = new Map<string, string>();
  for (const u of (upcoming ?? []) as unknown as { shoot_days: { shoot_date: string }; bookings: { freelancer_id: string; status: string } }[]) {
    if (u.bookings.status === "geannuleerd") continue;
    const cur = nextDate.get(u.bookings.freelancer_id);
    if (!cur || u.shoot_days.shoot_date < cur) nextDate.set(u.bookings.freelancer_id, u.shoot_days.shoot_date);
  }
  const ov = (overlaps ?? []) as { freelancer_id: string; freelancer_name: string; shoot_date: string }[];

  return (
    <>
      <PageHeader title="Freelancers" description="Register van crew. Een registratie is een contactrecord en geeft geen toegang tot het systeem." />
      {ov.map((o) => (
        <div key={o.freelancer_id + o.shoot_date} className="mb-3">
          <Alert tone="warn" title="Mogelijke dubbele boeking">
            <Link href={`/freelancers/${o.freelancer_id}`} className="underline">
              {o.freelancer_name}
            </Link>{" "}
            is op {formatDate(o.shoot_date, { weekday: true })} in meerdere projecten bevestigd.
          </Alert>
        </div>
      ))}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Card>
          <form method="get" role="search" className="flex flex-wrap items-end gap-3 border-b border-zinc-100 p-4">
            <div className="flex min-w-48 flex-1 flex-col gap-1">
              <Label htmlFor="fq">Zoeken</Label>
              <Input id="fq" name="q" defaultValue={sp.q} placeholder="Naam of plaats" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="frol">Specialisme</Label>
              <Select id="frol" name="rol" defaultValue={sp.rol ?? ""}>
                <option value="">Alle</option>
                {specs.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input type="checkbox" name="inactief" value="1" defaultChecked={sp.inactief === "1"} className="size-4 accent-ink" /> Ook inactief
            </label>
            <Button variant="dark">Filter</Button>
          </form>
          {rows.length === 0 ? (
            <CardBody>
              <EmptyState title="Geen freelancers gevonden" />
            </CardBody>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Naam</Th>
                  <Th>Specialisme</Th>
                  <Th>Contact</Th>
                  <Th>Beschikbaarheid</Th>
                  <Th>Eerstvolgende draaidag</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => (
                  <tr key={f.id} className="hover:bg-zinc-50">
                    <Td>
                      <Link href={`/freelancers/${f.id}`} className="font-semibold hover:underline">
                        {f.name}
                      </Link>
                      <div className="mt-0.5 flex gap-1">
                        {f.user_id ? <Badge tone="info">Account</Badge> : <Badge>Geen account</Badge>}
                        {!f.active && <Badge tone="warn">Inactief</Badge>}
                      </div>
                    </Td>
                    <Td>{f.specialisms.join(", ") || "—"}</Td>
                    <Td className="text-xs">
                      {f.email && <div>{f.email}</div>}
                      {f.phone && <div>{f.phone}</div>}
                    </Td>
                    <Td>
                      {AVAILABILITY_LABELS[f.availability]}
                      {f.availability_note && <p className="text-xs text-zinc-600">{f.availability_note}</p>}
                    </Td>
                    <Td>{nextDate.get(f.id) ? formatDate(nextDate.get(f.id), { weekday: true }) : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="Freelancer toevoegen" />
          <CardBody>
            <FreelancerForm action={createFreelancer} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
