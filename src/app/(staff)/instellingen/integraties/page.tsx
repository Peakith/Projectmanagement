import type { Metadata } from "next";
import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { formatDateTime } from "@/lib/domain/dates";
import { PageHeader, Alert } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th } from "@/components/ui/table";

export const metadata: Metadata = { title: "Integraties" };

export default async function IntegrationsPage() {
  const s = await requireOwner();
  const webhookOn = process.env.QUOTE_WEBHOOK_ENABLED === "true" && (process.env.QUOTE_WEBHOOK_SECRET ?? "").length >= 32;
  const [{ data: events }, { data: quotes }] = await Promise.all([
    s.supabase.from("integration_events").select("*").order("received_at", { ascending: false }).limit(30),
    s.supabase.from("integration_quotes").select("source, external_id, status, project_id, created_at, projects(name)").order("created_at", { ascending: false }).limit(30),
  ]);
  return (
    <>
      <PageHeader title="Integraties" description="Voorbereiding voor de koppeling met het (nog onbekende) offerteprogramma." />
      <div className="mb-5">
        <Alert tone={webhookOn ? "warn" : "info"} title={webhookOn ? "Offerte-webhook staat AAN" : "Offerte-webhook staat uit"}>
          {webhookOn
            ? "Alleen gesigneerde verzoeken (HMAC-SHA256 met tijdstempel) worden geaccepteerd op /api/integrations/quotes."
            : "Er is geen publieke webhook actief. Events kunnen lokaal worden gesimuleerd met npm run quotes:simulate. Zie README → Offerte-integratie."}
        </Alert>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Gekoppelde offertes" />
          <Table>
            <thead>
              <tr>
                <Th>Bron · ID</Th>
                <Th>Project</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {(quotes ?? []).map((q) => (
                <tr key={q.source + q.external_id}>
                  <Td>
                    {q.source} · {q.external_id}
                  </Td>
                  <Td>
                    <Link href={`/projecten/${q.project_id}`} className="underline">
                      {(q.projects as unknown as { name: string } | null)?.name}
                    </Link>
                  </Td>
                  <Td>
                    <Badge tone={q.status === "accepted" ? "ok" : "neutral"}>{q.status === "accepted" ? "Akkoord" : "Aangemaakt"}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Ontvangen events" />
          <Table>
            <thead>
              <tr>
                <Th>Ontvangen</Th>
                <Th>Type</Th>
                <Th>Resultaat</Th>
              </tr>
            </thead>
            <tbody>
              {(events ?? []).map((e) => (
                <tr key={e.id}>
                  <Td className="text-xs">{formatDateTime(e.received_at)}</Td>
                  <Td className="text-xs">
                    {e.event_type} · {e.source}:{e.external_id}
                  </Td>
                  <Td className="text-xs">{e.error ?? e.result ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
      <Card className="mt-5">
        <CardHeader title="Eventcontract" />
        <CardBody>
          <pre className="overflow-x-auto rounded bg-zinc-100 p-3 text-xs">{`{
  "source": "offerteprogramma",       // vaste naam van de provider
  "event_id": "evt_123",              // uniek per event (voor deduplicatie)
  "type": "quote.created" | "quote.accepted",
  "external_id": "OFF-2026-042",      // stabiele offerte-ID bij de provider
  "data": { "title": "...", "client_name": "...", "amount_cents": 1250000 }
}`}</pre>
          <p className="mt-2 text-sm text-zinc-600">
            quote.created maakt één project in Deal / offerte met de standaardtemplate. quote.accepted werkt hetzelfde project bij en stelt een faseovergang voor; er komt nooit een tweede project of tweede set taken.
          </p>
        </CardBody>
      </Card>
    </>
  );
}
