import { Download, ExternalLink } from "lucide-react";
import { getProject } from "@/lib/data/project";
import { formatDate } from "@/lib/domain/dates";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/action-button";
import { Table, Td, Th } from "@/components/ui/table";
import { DocumentForm } from "./document-form";
import { deleteDocument, setDocumentVisibility } from "../_actions/documents";

export default async function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { s } = await getProject(id);
  const { data: docs } = await s.supabase.from("documents").select("id, title, kind, url, file_name, size_bytes, visibility, created_at").eq("project_id", id).order("created_at", { ascending: false });
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title="Documenten en links" description="Operationele documenten. Financiële documenten horen in het afgeschermde financiële deel." />
        {(docs ?? []).length === 0 ? (
          <CardBody>
            <EmptyState title="Nog geen documenten of links" />
          </CardBody>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Titel</Th>
                <Th>Zichtbaarheid</Th>
                <Th>Toegevoegd</Th>
                <Th>
                  <span className="sr-only">Acties</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {(docs ?? []).map((d) => (
                <tr key={d.id}>
                  <Td>
                    {d.kind === "link" ? (
                      <a href={d.url!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold underline">
                        {d.title} <ExternalLink className="size-3.5" aria-hidden />
                      </a>
                    ) : (
                      <a href={`/api/documenten/${d.id}`} className="inline-flex items-center gap-1 font-semibold underline">
                        {d.title} <Download className="size-3.5" aria-hidden />
                      </a>
                    )}
                    {d.kind === "file" && (
                      <p className="text-xs text-zinc-600">
                        {d.file_name} · {Math.max(1, Math.round((d.size_bytes ?? 0) / 1024))} kB
                      </p>
                    )}
                  </Td>
                  <Td>{d.visibility === "crew" ? <Badge tone="info">Gedeeld met crew</Badge> : <Badge>Intern</Badge>}</Td>
                  <Td>{formatDate(d.created_at.slice(0, 10))}</Td>
                  <Td className="whitespace-nowrap text-right">
                    <ActionButton size="sm" variant="ghost" action={setDocumentVisibility.bind(null, id, d.id, d.visibility === "crew" ? "internal" : "crew")}>
                      {d.visibility === "crew" ? "Alleen intern" : "Deel met crew"}
                    </ActionButton>
                    <ActionButton size="sm" variant="ghost" className="text-red-800" action={deleteDocument.bind(null, id, d.id)} confirm={`"${d.title}" verwijderen?`}>
                      Verwijder
                    </ActionButton>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader title="Toevoegen" description="Link (bijv. Drive, WeTransfer, groepsapp) of bestand tot 10 MB." />
        <CardBody>
          <DocumentForm projectId={id} />
        </CardBody>
      </Card>
    </div>
  );
}
