import type { Metadata } from "next";
import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { formatDate } from "@/lib/domain/dates";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/action-button";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { createDraftVersion, createVariant, setDefaultTemplate } from "./actions";

export const metadata: Metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const s = await requireOwner();
  const { data: templates } = await s.supabase.from("templates").select("id, name, description, is_default, template_versions(id, version, published_at, created_at)").order("name");
  const counts = new Map<string, number>();
  const { data: tc } = await s.supabase.from("template_tasks").select("template_version_id");
  for (const r of tc ?? []) counts.set(r.template_version_id, (counts.get(r.template_version_id) ?? 0) + 1);
  type V = { id: string; version: number; published_at: string | null; created_at: string };
  const allVersions = (templates ?? []).flatMap((t) => (t.template_versions as V[]).filter((v) => v.published_at).map((v) => ({ id: v.id, label: `${t.name} v${v.version}` })));
  return (
    <>
      <PageHeader title="Templates" description="Templates zijn geversioneerd. Bij projectaanmaak wordt de gekozen versie gekopieerd; latere wijzigingen veranderen bestaande projecten niet." />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-5">
          {(templates ?? []).map((t) => {
            const versions = (t.template_versions as V[]).sort((a, b) => b.version - a.version);
            const hasDraft = versions.some((v) => !v.published_at);
            return (
              <Card key={t.id}>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      {t.name} {t.is_default && <Badge tone="brand">Standaard</Badge>}
                    </span>
                  }
                  description={t.description}
                  action={
                    <div className="flex gap-2">
                      {!t.is_default && (
                        <ActionButton size="sm" variant="outline" action={setDefaultTemplate.bind(null, t.id)}>
                          Maak standaard
                        </ActionButton>
                      )}
                      {!hasDraft && (
                        <ActionButton size="sm" action={createDraftVersion.bind(null, t.id)}>
                          Nieuwe versie maken
                        </ActionButton>
                      )}
                    </div>
                  }
                />
                <ul className="divide-y divide-zinc-100 text-sm">
                  {versions.map((v) => (
                    <li key={v.id} className="flex items-center justify-between px-4 py-2">
                      <Link href={`/instellingen/templates/${v.id}`} className="font-semibold hover:underline">
                        Versie {v.version}
                      </Link>
                      <span className="flex items-center gap-2 text-zinc-600">
                        {counts.get(v.id) ?? 0} taken ·{" "}
                        {v.published_at ? <Badge tone="ok">Gepubliceerd {formatDate(v.published_at.slice(0, 10))}</Badge> : <Badge tone="warn">Concept</Badge>}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
        <Card>
          <CardHeader title="Nieuwe variant" description="Bijvoorbeeld een lichte template voor kleine opdrachten." />
          <CardBody>
            <ActionForm action={createVariant} className="flex flex-col gap-3">
              <Field label="Naam" htmlFor="tv-name" required>
                <Input id="tv-name" name="name" required maxLength={100} />
              </Field>
              <Field label="Omschrijving" htmlFor="tv-desc">
                <Input id="tv-desc" name="description" maxLength={500} />
              </Field>
              <Field label="Kopieer taken uit" htmlFor="tv-from">
                <Select id="tv-from" name="from_version" defaultValue={allVersions[0]?.id ?? ""}>
                  <option value="">Leeg beginnen</option>
                  {allVersions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <SubmitButton size="sm">Variant maken</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
