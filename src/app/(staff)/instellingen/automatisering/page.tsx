import type { Metadata } from "next";
import { requireOwner } from "@/lib/auth";
import { formatDateTime } from "@/lib/domain/dates";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/action-button";
import { Table, Td, Th } from "@/components/ui/table";
import { runJobsNow } from "../actions";

export const metadata: Metadata = { title: "Automatisering" };

const SIGNALS = [
  ["Afgeronde volgende actie", "Direct (databasetrigger): melding aan eigenaar en projectverantwoordelijke om een nieuwe actie te kiezen."],
  ["Achterstallige taken", "Niet-optionele open taken met een verstreken deadline."],
  ["Naderende deadlines", "Open taken met een deadline binnen 2 dagen."],
  ["Wachten met opvolgdatum", "Wachtende of geblokkeerde taken waarvan de opvolgdatum is bereikt."],
  ["Volgende actie op datum", "Projecten waarvan de volgende actie vandaag of eerder gepland stond."],
  ["Crew niet bevestigd", "Draaidag binnen 7 dagen zonder (volledig) bevestigde crew."],
  ["Voorbereiding draaidag", "Draaidag binnen 3 dagen zonder callsheet of met open pre-productietaken."],
  ["Back-upcontrole", "Na een draaidag is de back-upcontrole nog niet bevestigd."],
  ["Reviews", "Feedback van de klant uitgebleven, of ontvangen feedback die nog niet is verwerkt."],
  ["Facturen (alleen eigenaar)", "Vervallen facturen met openstaand bedrag en financiële opvolgingen."],
  ["Evaluatie", "14 dagen na overgang naar oplevering/afronding met open evaluatietaken."],
];

export default async function AutomationPage() {
  const s = await requireOwner();
  const { data: jobs } = await s.supabase.rpc("job_overview", { p_limit: 40 });
  type J = { id: string; kind: string; status: string; attempts: number; run_at: string; finished_at: string | null; last_error: string | null; result: Record<string, number> | null; created_at: string };
  return (
    <>
      <PageHeader
        title="Automatisering"
        description="Signaleringen worden als in-app meldingen vastgelegd. Ze veranderen nooit zelf een fase of deadline; ze stellen hooguit iets voor."
        actions={<ActionButton action={runJobsNow}>Nu uitvoeren</ActionButton>}
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Hoe de scheduler draait" />
          <CardBody className="flex flex-col gap-2 text-sm text-zinc-700">
            <p>
              Geplande taken staan in een persistente jobtabel met retries (exponentiële backoff, max. 5 pogingen), foutregistratie en deduplicatie. Elke melding heeft een unieke sleutel per gebeurtenis en datum, zodat herhalen geen stapel identieke meldingen oplevert.
            </p>
            <p>
              <strong>Lokaal:</strong> <code>npm run jobs:run</code> (eenmalig) of <code>npm run jobs:run -- --loop</code> (elke 15 minuten).
            </p>
            <p>
              <strong>Productie:</strong> een externe scheduler roept <code>POST /api/cron/run</code> aan met <code>Authorization: Bearer CRON_SECRET</code>. Zie README → Scheduler. Die moet bij deployment nog worden aangesloten.
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Signaleringen" />
          <CardBody>
            <dl className="flex flex-col gap-2 text-sm">
              {SIGNALS.map(([t, d]) => (
                <div key={t}>
                  <dt className="font-semibold">{t}</dt>
                  <dd className="text-zinc-600">{d}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      </div>
      <Card className="mt-5">
        <CardHeader title="Recente jobs" />
        <Table>
          <thead>
            <tr>
              <Th>Type</Th>
              <Th>Status</Th>
              <Th>Pogingen</Th>
              <Th>Gepland</Th>
              <Th>Klaar</Th>
              <Th>Resultaat / fout</Th>
            </tr>
          </thead>
          <tbody>
            {((jobs ?? []) as J[]).map((j) => (
              <tr key={j.id}>
                <Td>{j.kind}</Td>
                <Td>
                  <Badge tone={j.status === "done" ? "ok" : j.status === "failed" ? "danger" : "warn"}>{j.status}</Badge>
                </Td>
                <Td>{j.attempts}</Td>
                <Td className="text-xs">{formatDateTime(j.run_at)}</Td>
                <Td className="text-xs">{formatDateTime(j.finished_at)}</Td>
                <Td className="max-w-md text-xs">
                  {j.last_error ? (
                    <span className="text-red-800">{j.last_error}</span>
                  ) : j.result ? (
                    Object.entries(j.result)
                      .filter(([, n]) => typeof n === "number" && n > 0)
                      .map(([k, n]) => `${k}: ${n}`)
                      .join(", ") || "geen nieuwe meldingen"
                  ) : (
                    "—"
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
