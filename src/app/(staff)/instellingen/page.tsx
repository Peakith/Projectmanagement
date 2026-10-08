import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/domain/labels";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { addBrand, changePassword, updateProfile } from "./actions";

export const metadata: Metadata = { title: "Instellingen" };

export default async function SettingsPage() {
  const s = await requireStaff();
  const owner = s.role === "owner";
  const { data: brands } = await s.supabase.from("brands").select("id, name, slug, active").order("name");
  return (
    <>
      <PageHeader title="Instellingen" description={`Ingelogd als ${s.email} · ${ROLE_LABELS[s.role]}`} />
      {owner && (
        <nav aria-label="Beheer" className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["/instellingen/gebruikers", "Gebruikers en rollen", "Uitnodigen, rollen, toegang intrekken"],
            ["/instellingen/templates", "Templates", "Productietemplate en versies"],
            ["/instellingen/automatisering", "Automatisering", "Signaleringen, jobs en scheduler"],
            ["/instellingen/integraties", "Integraties", "Voorbereiding offerte-koppeling"],
          ].map(([href, title, desc]) => (
            <Link key={href} href={href} className="rounded-lg border border-zinc-200 bg-white p-4 hover:border-ink">
              <p className="font-heading font-bold">{title}</p>
              <p className="text-sm text-zinc-600">{desc}</p>
            </Link>
          ))}
        </nav>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Profiel" />
          <CardBody className="flex flex-col gap-5">
            <ActionForm action={updateProfile} className="flex items-end gap-2">
              <Field label="Weergavenaam" htmlFor="pr-name" className="flex-1">
                <Input id="pr-name" name="full_name" defaultValue={s.name} required maxLength={120} />
              </Field>
              <SubmitButton size="sm">Opslaan</SubmitButton>
            </ActionForm>
            <ActionForm action={changePassword} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
              <Field label="Nieuw wachtwoord" htmlFor="pr-pw">
                <Input id="pr-pw" name="password" type="password" autoComplete="new-password" minLength={10} required />
              </Field>
              <Field label="Herhaal" htmlFor="pr-pw2">
                <Input id="pr-pw2" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
              </Field>
              <div>
                <SubmitButton size="sm" variant="outline">
                  Wachtwoord wijzigen
                </SubmitButton>
              </div>
            </ActionForm>
            <p className="text-xs text-zinc-500">Je rol en bevoegdheden kun je niet zelf wijzigen.</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Merken" description="Studio Brutaal is actief. Ruimte voor een tweede merk zoals Moviemates Studio's; projecten kunnen per merk worden gefilterd." />
          <CardBody className="flex flex-col gap-3 text-sm">
            <ul className="flex flex-wrap gap-2">
              {(brands ?? []).map((b) => (
                <li key={b.id}>
                  <Badge tone={b.active ? "dark" : "neutral"}>{b.name}</Badge>
                </li>
              ))}
            </ul>
            {owner && (
              <ActionForm action={addBrand} resetOnSuccess className="flex items-end gap-2">
                <Field label="Nieuw merk" htmlFor="br-name" className="flex-1">
                  <Input id="br-name" name="name" maxLength={100} placeholder="Moviemates Studio's" />
                </Field>
                <SubmitButton size="sm" variant="outline">
                  Toevoegen
                </SubmitButton>
              </ActionForm>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Meldingen" />
          <CardBody className="text-sm text-zinc-700">
            Meldingen verschijnen alleen in de app (belletje rechtsboven). Er worden in deze versie geen e-mails, sms of andere externe berichten automatisch verstuurd.
          </CardBody>
        </Card>
      </div>
    </>
  );
}
