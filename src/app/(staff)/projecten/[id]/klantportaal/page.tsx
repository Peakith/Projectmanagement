import { requireOwner } from "@/lib/auth";
import { getProject } from "@/lib/data/project";
import { loadSnapshotSource } from "@/lib/data/portal";
import { buildSnapshot, emptyDraft, portalDraftSchema, type PortalSnapshot } from "@/lib/domain/portal";
import { formatDateTime } from "@/lib/domain/dates";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ActionButton } from "@/components/action-button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/input";
import { PortalView } from "@/components/portal-view";
import { DraftForm } from "./draft-form";
import { grantAccess, publish, revokeAccess, unpublish } from "../_actions/portal";

export default async function PortalSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  const { s } = await getProject(id);
  const db = s.supabase;
  const [{ data: draftRow }, { data: snap }, { data: access }, { data: users }, source] = await Promise.all([
    db.from("portal_drafts").select("content, updated_at").eq("project_id", id).maybeSingle(),
    db.from("portal_snapshots").select("content, published_at").eq("project_id", id).maybeSingle(),
    db.from("portal_access").select("id, user_id, granted_at, revoked_at").eq("project_id", id).order("granted_at"),
    db.rpc("admin_list_users"),
    loadSnapshotSource(db, id),
  ]);
  const parsed = portalDraftSchema.safeParse(draftRow?.content ?? {});
  const draft = parsed.success ? parsed.data : emptyDraft();
  const preview = buildSnapshot(draft, source);
  const clientUsers = ((users ?? []) as { user_id: string; email: string; full_name: string; role: string | null; active: boolean }[]).filter((u) => u.role === "client" && u.active);
  const userName = (uid: string) => {
    const u = (users ?? []).find((x: { user_id: string }) => x.user_id === uid) as { full_name: string; email: string } | undefined;
    return u ? `${u.full_name} (${u.email})` : "Onbekend account";
  };
  const active = (access ?? []).filter((a) => !a.revoked_at);
  const differs = snap && JSON.stringify(snap.content) !== JSON.stringify(preview);

  return (
    <div className="flex flex-col gap-5">
      <Alert tone="info">
        Klanten zien alleen wat je hier expliciet publiceert. Interne notities, taken, crew en financiën worden nooit gedeeld. Feedback blijft in Vimeo.
      </Alert>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Toegang" description="Alleen klantaccounts met expliciete toegang zien dit project." />
          <CardBody className="flex flex-col gap-3 text-sm">
            {active.length === 0 ? (
              <p className="text-zinc-600">Nog niemand heeft toegang.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {active.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                    <span>{userName(a.user_id)}</span>
                    <ActionButton size="sm" variant="outline" action={revokeAccess.bind(null, id, a.id)} confirm="Toegang intrekken? De klant ziet het project direct niet meer.">
                      Intrekken
                    </ActionButton>
                  </li>
                ))}
              </ul>
            )}
            {clientUsers.length === 0 ? (
              <p className="text-zinc-600">Maak eerst een klantaccount aan via Instellingen → Gebruikers.</p>
            ) : (
              <ActionForm action={grantAccess.bind(null, id)} className="flex flex-wrap items-end gap-2">
                <Field label="Klantaccount" htmlFor="pa-user" className="flex-1">
                  <Select id="pa-user" name="user_id" required defaultValue="">
                    <option value="">Kies…</option>
                    {clientUsers
                      .filter((u) => !active.some((a) => a.user_id === u.user_id))
                      .map((u) => (
                        <option key={u.user_id} value={u.user_id}>
                          {u.full_name} ({u.email})
                        </option>
                      ))}
                  </Select>
                </Field>
                <SubmitButton size="sm">Toegang geven</SubmitButton>
              </ActionForm>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Publicatie" />
          <CardBody className="flex flex-col gap-3 text-sm">
            {snap ? (
              <p>
                <Badge tone="ok">Gepubliceerd</Badge> op {formatDateTime(snap.published_at)}
                {differs && <span className="ml-1 font-semibold text-amber-800">· concept/actuele gegevens wijken af van de publicatie</span>}
              </p>
            ) : (
              <p>
                <Badge>Niet gepubliceerd</Badge> De klant ziet nog niets.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <ActionButton action={publish.bind(null, id)} disabled={!draftRow} confirm="Huidige preview publiceren voor de klant?">
                {snap ? "Opnieuw publiceren" : "Publiceren"}
              </ActionButton>
              {snap && (
                <ActionButton variant="outline" action={unpublish.bind(null, id)} confirm="Publicatie intrekken? De klant ziet dan niets meer.">
                  Publicatie intrekken
                </ActionButton>
              )}
            </div>
            {!draftRow && <p className="text-xs text-zinc-600">Sla eerst een concept op.</p>}
          </CardBody>
        </Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Concept" description="Niets wordt automatisch uit interne velden overgenomen." />
          <CardBody>
            <DraftForm projectId={id} draft={draft} deliverables={source.deliverables.map((d) => ({ id: d.id, name: d.name }))} />
          </CardBody>
        </Card>
        <Card className="bg-zinc-100">
          <CardHeader title="Preview: zo ziet de klant het na publicatie" />
          <CardBody>
            <PortalView s={preview as PortalSnapshot} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
