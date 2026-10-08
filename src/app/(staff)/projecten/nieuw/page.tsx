import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { lookups } from "@/lib/data/overview";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardBody } from "@/components/ui/card";
import { NewProjectForm } from "./form";

export const metadata: Metadata = { title: "Nieuw project" };

export default async function NewProjectPage() {
  const s = await requireStaff();
  const refs = await lookups(s.supabase);
  const { data: templates } = await s.supabase.from("templates").select("id, name, is_default, template_versions(version, published_at)").order("name");
  const usable = (templates ?? [])
    .map((t) => {
      const versions = (t.template_versions as { version: number; published_at: string | null }[]).filter((v) => v.published_at);
      return { id: t.id as string, name: t.name as string, isDefault: t.is_default as boolean, version: Math.max(0, ...versions.map((v) => v.version)) };
    })
    .filter((t) => t.version > 0);
  return (
    <>
      <PageHeader title="Nieuw project" description="Het project krijgt een vaste kopie van de gekozen templateversie. Latere templatewijzigingen veranderen dit project niet." />
      <Card className="max-w-3xl">
        <CardBody>
          <NewProjectForm clients={refs.clients} staff={refs.staff} brands={refs.brands} templates={usable} me={s.userId} />
        </CardBody>
      </Card>
    </>
  );
}
