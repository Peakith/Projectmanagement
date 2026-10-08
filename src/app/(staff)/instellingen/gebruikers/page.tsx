import type { Metadata } from "next";
import { requireOwner } from "@/lib/auth";
import { formatDateTime } from "@/lib/domain/dates";
import { ROLE_LABELS, type AppRole } from "@/lib/domain/labels";
import { PageHeader, Alert } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th } from "@/components/ui/table";
import { InviteForm } from "./invite-form";
import { UserActions } from "./user-actions";

export const metadata: Metadata = { title: "Gebruikers" };

type U = { user_id: string; email: string; full_name: string; role: AppRole | null; active: boolean; freelancer_id: string | null; last_sign_in_at: string | null };

export default async function UsersPage() {
  const s = await requireOwner();
  const [{ data: users }, { data: freelancers }, { data: projects }] = await Promise.all([
    s.supabase.rpc("admin_list_users"),
    s.supabase.from("freelancers").select("id, name").eq("active", true).order("name"),
    s.supabase.from("projects").select("id, name").is("archived_at", null).order("name"),
  ]);
  return (
    <>
      <PageHeader title="Gebruikers en rollen" description="Alleen de eigenaar beheert accounts. Rollen worden server-side vastgelegd; gebruikers kunnen hun eigen rol niet wijzigen." />
      <div className="mb-5">
        <Alert tone="info">
          Open registratie staat uit. Nieuwe accounts maak je hier aan; je krijgt een eenmalige link die je zelf naar de persoon stuurt. Een freelancerregistratie geeft op zichzelf nooit toegang.
        </Alert>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Gebruiker</Th>
                <Th>Rol</Th>
                <Th>Laatst ingelogd</Th>
                <Th>Beheer</Th>
              </tr>
            </thead>
            <tbody>
              {((users ?? []) as U[]).map((u) => (
                <tr key={u.user_id}>
                  <Td>
                    <p className="font-semibold">{u.full_name || "—"}</p>
                    <p className="text-xs text-zinc-600">{u.email}</p>
                  </Td>
                  <Td>
                    {u.role ? <Badge tone={u.role === "owner" ? "brand" : "neutral"}>{ROLE_LABELS[u.role]}</Badge> : <Badge tone="warn">Geen rol</Badge>}
                    {u.role && !u.active && (
                      <Badge tone="danger" className="ml-1">
                        Ingetrokken
                      </Badge>
                    )}
                    {u.role === "freelancer" && !u.freelancer_id && <p className="mt-1 text-xs text-amber-800">Niet gekoppeld: ziet niets</p>}
                  </Td>
                  <Td className="text-xs">{formatDateTime(u.last_sign_in_at)}</Td>
                  <Td>
                    {u.user_id === s.userId || u.role === "owner" ? (
                      <span className="text-xs text-zinc-500">{u.user_id === s.userId ? "Dit ben jij" : "Eigenaar"}</span>
                    ) : (
                      <UserActions userId={u.user_id} role={u.role} active={u.active} freelancerId={u.freelancer_id} freelancers={freelancers ?? []} />
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Account aanmaken" />
          <CardBody>
            <InviteForm freelancers={freelancers ?? []} projects={projects ?? []} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
