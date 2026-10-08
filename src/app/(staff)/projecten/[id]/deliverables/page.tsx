import { ExternalLink } from "lucide-react";
import { getProject } from "@/lib/data/project";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { nextRoundInfo, roundLabel } from "@/lib/domain/feedback";
import { APPROVAL_SOURCES, APPROVAL_SOURCE_LABELS, FEEDBACK_STATUSES, FEEDBACK_STATUS_LABELS } from "@/lib/domain/labels";
import type { Deliverable, DeliverableVersion, FeedbackRound } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { FeedbackBadge } from "@/components/status";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ActionButton } from "@/components/action-button";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { Table, Td, Th } from "@/components/ui/table";
import { addDeliverable, addLink, addVersion, approve, deleteDeliverable, deleteLink, openRound, revokeApproval, updateDeliverable, updateRound } from "../_actions/deliverables";

const STD_FORMATS = ["16:9", "9:16", "1:1", "4:5"];

export default async function DeliverablesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { s } = await getProject(id);
  const db = s.supabase;
  const today = todayISO();
  const owner = s.role === "owner";
  const { data: ds } = await db.from("deliverables").select("*").eq("project_id", id).order("sort").order("created_at");
  const deliverables = (ds ?? []) as Deliverable[];
  const ids = deliverables.map((d) => d.id);
  const [{ data: versions }, { data: rounds }, { data: links }] = ids.length
    ? await Promise.all([
        db.from("deliverable_versions").select("*").in("deliverable_id", ids).order("version_number"),
        db.from("feedback_rounds").select("*").in("deliverable_id", ids).order("round_number"),
        db.from("deliverable_links").select("*").in("deliverable_id", ids).order("created_at"),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-zinc-600">
        Per video gelden de afgesproken feedbackrondes (standaard twee). Versies en exportformaten verbruiken geen ronde. Feedback zelf blijft in Vimeo; hier leg je de reviewlinks en de status vast.
      </p>
      {deliverables.length === 0 && <EmptyState title="Nog geen video's vastgelegd" />}
      {deliverables.map((d) => {
        const vs = ((versions ?? []) as DeliverableVersion[]).filter((v) => v.deliverable_id === d.id);
        const rs = ((rounds ?? []) as FeedbackRound[]).filter((r) => r.deliverable_id === d.id);
        const ls = ((links ?? []) as { id: string; deliverable_id: string; label: string; url: string; format: string }[]).filter((l) => l.deliverable_id === d.id);
        const approvedVersion = vs.find((v) => v.id === d.approved_version_id);
        const info = nextRoundInfo(d.included_rounds, rs, !!d.approved_version_id);
        const latest = vs.at(-1);
        return (
          <Card key={d.id}>
            <CardHeader
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {d.name}
                  {d.delivered_on ? <Badge tone="ok">Opgeleverd {formatDate(d.delivered_on)}</Badge> : approvedVersion ? <Badge tone="ok">Akkoord op v{approvedVersion.version_number}</Badge> : <Badge>Nog geen akkoord</Badge>}
                  {d.formats.map((f) => (
                    <Badge key={f} tone="info">
                      {f}
                    </Badge>
                  ))}
                </span>
              }
              description={`Geplande oplevering: ${formatDate(d.planned_delivery_date, { year: true })} · ${info.usedIncluded} van ${d.included_rounds} inbegrepen rondes gebruikt`}
            />
            <CardBody className="flex flex-col gap-5">
              {(d.goal || d.scope) && (
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  {d.goal && (
                    <p>
                      <span className="font-semibold">Doel: </span>
                      {d.goal}
                    </p>
                  )}
                  {d.scope && (
                    <p>
                      <span className="font-semibold">Afgesproken scope: </span>
                      {d.scope}
                    </p>
                  )}
                </div>
              )}

              {/* Versies */}
              <section aria-label={`Versies van ${d.name}`}>
                <h3 className="mb-2 text-sm font-bold">Versies</h3>
                {vs.length === 0 ? (
                  <p className="text-sm text-zinc-600">Nog geen versie.</p>
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <Th>Versie</Th>
                        <Th>Datum</Th>
                        <Th>Reviewlink</Th>
                        <Th>Notities</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {vs.map((v) => (
                        <tr key={v.id}>
                          <Td className="font-semibold">v{v.version_number}</Td>
                          <Td>{formatDate(v.delivered_on)}</Td>
                          <Td>
                            {v.review_url ? (
                              <a href={v.review_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">
                                Vimeo-review <ExternalLink className="size-3" aria-hidden />
                              </a>
                            ) : (
                              "—"
                            )}
                          </Td>
                          <Td>{v.notes}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-semibold">Nieuwe versie vastleggen</summary>
                  <ActionForm key={`v-${latest?.id}`} action={addVersion.bind(null, id, d.id)} resetOnSuccess className="mt-2 grid gap-3 sm:grid-cols-4">
                    <Field label="Versienummer" htmlFor={`v-n-${d.id}`}>
                      <Input id={`v-n-${d.id}`} name="version_number" type="number" min={1} defaultValue={(latest?.version_number ?? 0) + 1} required />
                    </Field>
                    <Field label="Datum" htmlFor={`v-d-${d.id}`}>
                      <Input id={`v-d-${d.id}`} name="delivered_on" type="date" defaultValue={today} required />
                    </Field>
                    <Field label="Vimeo-reviewlink" htmlFor={`v-u-${d.id}`} className="sm:col-span-2">
                      <Input id={`v-u-${d.id}`} name="review_url" type="url" placeholder="https://vimeo.com/…" />
                    </Field>
                    <Field label="Notities" htmlFor={`v-no-${d.id}`} className="sm:col-span-4">
                      <Input id={`v-no-${d.id}`} name="notes" maxLength={2000} />
                    </Field>
                    <div>
                      <SubmitButton size="sm">Versie opslaan</SubmitButton>
                    </div>
                  </ActionForm>
                </details>
              </section>

              {/* Feedbackrondes */}
              <section aria-label={`Feedbackrondes van ${d.name}`}>
                <h3 className="mb-2 text-sm font-bold">Feedbackrondes</h3>
                {rs.length === 0 && <p className="text-sm text-zinc-600">Nog geen feedbackronde.</p>}
                <ul className="flex flex-col gap-2">
                  {rs.map((r) => (
                    <li key={r.id} className="rounded-md border border-zinc-200 p-3">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-bold">{roundLabel(r)}</span>
                        {r.is_extra && <Badge tone="warn">Buiten scope — extra</Badge>}
                        <FeedbackBadge status={r.status} />
                        {r.version_id && <span className="text-zinc-600">op v{vs.find((v) => v.id === r.version_id)?.version_number}</span>}
                        {r.feedback_due && r.status === "wacht_op_feedback" && (
                          <span className={r.feedback_due < today ? "font-semibold text-red-800" : "text-zinc-600"}>feedback verwacht {formatDate(r.feedback_due)}</span>
                        )}
                      </div>
                      {r.is_extra && <p className="mt-1 text-xs text-zinc-600">Reden: {r.extra_reason} · goedgekeurd {r.extra_approved_at ? formatDate(r.extra_approved_at.slice(0, 10)) : ""}</p>}
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-semibold">Ronde bijwerken</summary>
                        <ActionForm action={updateRound.bind(null, id, r.id)} className="mt-2 grid gap-2 sm:grid-cols-3">
                          <Field label="Status" htmlFor={`r-s-${r.id}`}>
                            <Select id={`r-s-${r.id}`} name="status" defaultValue={r.status}>
                              {FEEDBACK_STATUSES.map((st) => (
                                <option key={st} value={st}>
                                  {FEEDBACK_STATUS_LABELS[st]}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <Field label="Versie" htmlFor={`r-v-${r.id}`}>
                            <Select id={`r-v-${r.id}`} name="version_id" defaultValue={r.version_id ?? ""}>
                              <option value="">—</option>
                              {vs.map((v) => (
                                <option key={v.id} value={v.id}>
                                  v{v.version_number}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <Field label="Opgevraagd op" htmlFor={`r-rq-${r.id}`}>
                            <Input id={`r-rq-${r.id}`} name="requested_on" type="date" defaultValue={r.requested_on ?? ""} />
                          </Field>
                          <Field label="Feedback verwacht" htmlFor={`r-fd-${r.id}`}>
                            <Input id={`r-fd-${r.id}`} name="feedback_due" type="date" defaultValue={r.feedback_due ?? ""} />
                          </Field>
                          <Field label="Ontvangen op" htmlFor={`r-rc-${r.id}`}>
                            <Input id={`r-rc-${r.id}`} name="received_on" type="date" defaultValue={r.received_on ?? ""} />
                          </Field>
                          <Field label="Verwerkt op" htmlFor={`r-pr-${r.id}`}>
                            <Input id={`r-pr-${r.id}`} name="processed_on" type="date" defaultValue={r.processed_on ?? ""} />
                          </Field>
                          <Field label="Notities" htmlFor={`r-n-${r.id}`} className="sm:col-span-3">
                            <Input id={`r-n-${r.id}`} name="notes" defaultValue={r.notes} maxLength={2000} />
                          </Field>
                          <div>
                            <SubmitButton size="sm">Opslaan</SubmitButton>
                          </div>
                        </ActionForm>
                      </details>
                    </li>
                  ))}
                </ul>
                {info.scopeWarning && (
                  <div className="mt-3">
                    <Alert tone="warn" title="Inbegrepen feedbackrondes zijn gebruikt">
                      Extra feedback kan buiten de afgesproken scope vallen. Een extra ronde kan pas na registratie van het meerwerk met reden en goedkeuring{owner ? "" : " door de eigenaar"}.
                    </Alert>
                  </div>
                )}
                {!info.blockedByOpenRound && !(info.requiresExtraApproval && !owner) && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-semibold">{info.requiresExtraApproval ? `Extra ronde ${info.nextRoundNumber} openen (meerwerk)` : `Ronde ${info.nextRoundNumber} openen`}</summary>
                    <ActionForm key={`or-${latest?.id}-${rs.length}`} action={openRound.bind(null, id, d.id)} className="mt-2 grid gap-3 sm:grid-cols-3">
                      <Field label="Versie ter review" htmlFor={`or-v-${d.id}`}>
                        <Select id={`or-v-${d.id}`} name="version_id" defaultValue={latest?.id ?? ""}>
                          <option value="">—</option>
                          {vs.map((v) => (
                            <option key={v.id} value={v.id}>
                              v{v.version_number}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Opgevraagd op" htmlFor={`or-rq-${d.id}`} hint="Leeg = nog gepland">
                        <Input id={`or-rq-${d.id}`} name="requested_on" type="date" defaultValue={today} />
                      </Field>
                      <Field label="Feedback verwacht op" htmlFor={`or-fd-${d.id}`}>
                        <Input id={`or-fd-${d.id}`} name="feedback_due" type="date" />
                      </Field>
                      {info.requiresExtraApproval && (
                        <>
                          <Field label="Reden extra werk" htmlFor={`or-r-${d.id}`} required className="sm:col-span-3">
                            <Textarea id={`or-r-${d.id}`} name="extra_reason" required maxLength={1000} />
                          </Field>
                          <Field label="Bedrag meerwerk (optioneel, excl. btw)" htmlFor={`or-a-${d.id}`} hint="Wordt alleen in het afgeschermde financiële deel vastgelegd. Er wordt niet automatisch gefactureerd.">
                            <Input id={`or-a-${d.id}`} name="extra_amount" inputMode="decimal" placeholder="€ 0,00" />
                          </Field>
                          <label className="flex items-center gap-2 text-sm sm:col-span-2">
                            <Checkbox name="extra_approved" required /> Ik keur dit extra werk goed
                          </label>
                        </>
                      )}
                      <div className="sm:col-span-3">
                        <SubmitButton size="sm" variant={info.requiresExtraApproval ? "dark" : "primary"}>
                          Ronde openen
                        </SubmitButton>
                      </div>
                    </ActionForm>
                  </details>
                )}
                {info.blockedByOpenRound && <p className="mt-2 text-xs text-zinc-600">Een nieuwe ronde kan worden geopend zodra de lopende ronde is verwerkt.</p>}
              </section>

              {/* Akkoord */}
              <section aria-label={`Akkoord ${d.name}`}>
                <h3 className="mb-2 text-sm font-bold">Klantakkoord</h3>
                {approvedVersion ? (
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span>
                      Akkoord op <strong>v{approvedVersion.version_number}</strong> op {formatDate(d.approved_on, { year: true })} via {d.approval_source ? APPROVAL_SOURCE_LABELS[d.approval_source] : "—"}
                      {d.approval_reference && ` — ${d.approval_reference}`}
                    </span>
                    <ActionButton size="sm" variant="ghost" action={revokeApproval.bind(null, id, d.id)} confirm="Akkoord intrekken?">
                      Intrekken
                    </ActionButton>
                  </div>
                ) : vs.length === 0 ? (
                  <p className="text-sm text-zinc-600">Leg eerst een versie vast.</p>
                ) : (
                  <ActionForm key={`ap-${latest?.id}`} action={approve.bind(null, id, d.id)} success="Akkoord vastgelegd" className="grid gap-3 sm:grid-cols-4">
                    <Field label="Versie" htmlFor={`ap-v-${d.id}`}>
                      <Select id={`ap-v-${d.id}`} name="approved_version_id" defaultValue={latest?.id}>
                        {vs.map((v) => (
                          <option key={v.id} value={v.id}>
                            v{v.version_number}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Datum akkoord" htmlFor={`ap-d-${d.id}`}>
                      <Input id={`ap-d-${d.id}`} name="approved_on" type="date" defaultValue={today} required />
                    </Field>
                    <Field label="Bron" htmlFor={`ap-s-${d.id}`}>
                      <Select id={`ap-s-${d.id}`} name="approval_source" defaultValue="vimeo">
                        {APPROVAL_SOURCES.map((a) => (
                          <option key={a} value={a}>
                            {APPROVAL_SOURCE_LABELS[a]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Verwijzing" htmlFor={`ap-r-${d.id}`} hint="Bijv. onderwerp van de mail">
                      <Input id={`ap-r-${d.id}`} name="approval_reference" maxLength={500} />
                    </Field>
                    <div>
                      <SubmitButton size="sm">Akkoord vastleggen</SubmitButton>
                    </div>
                  </ActionForm>
                )}
              </section>

              {/* Definitieve bestanden */}
              <section aria-label={`Definitieve bestanden ${d.name}`}>
                <h3 className="mb-2 text-sm font-bold">Definitieve bestanden / downloadlinks</h3>
                {ls.length === 0 ? (
                  <p className="text-sm text-zinc-600">Nog geen definitieve links.</p>
                ) : (
                  <ul className="mb-2 flex flex-col gap-1 text-sm">
                    {ls.map((l) => (
                      <li key={l.id} className="flex items-center gap-2">
                        <a href={l.url} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                          {l.label}
                        </a>
                        {l.format && <Badge tone="info">{l.format}</Badge>}
                        <ActionButton size="sm" variant="ghost" action={deleteLink.bind(null, id, l.id)} confirm="Link verwijderen?">
                          Verwijder
                        </ActionButton>
                      </li>
                    ))}
                  </ul>
                )}
                <ActionForm action={addLink.bind(null, id, d.id)} resetOnSuccess className="grid gap-2 sm:grid-cols-[1fr_2fr_8rem_auto] sm:items-end">
                  <Field label="Omschrijving" htmlFor={`l-l-${d.id}`}>
                    <Input id={`l-l-${d.id}`} name="label" required maxLength={200} />
                  </Field>
                  <Field label="Link" htmlFor={`l-u-${d.id}`}>
                    <Input id={`l-u-${d.id}`} name="url" type="url" required placeholder="https://" />
                  </Field>
                  <Field label="Formaat" htmlFor={`l-f-${d.id}`}>
                    <Input id={`l-f-${d.id}`} name="format" maxLength={20} list="formats" />
                  </Field>
                  <SubmitButton size="sm">Toevoegen</SubmitButton>
                </ActionForm>
              </section>

              <details>
                <summary className="cursor-pointer text-sm font-semibold">Videogegevens bewerken</summary>
                <DeliverableForm action={updateDeliverable.bind(null, id, d.id)} d={d} />
                <ActionButton size="sm" variant="ghost" className="mt-2 text-red-800" action={deleteDeliverable.bind(null, id, d.id)} confirm={`Video "${d.name}" met alle versies en rondes verwijderen?`}>
                  Video verwijderen
                </ActionButton>
              </details>
            </CardBody>
          </Card>
        );
      })}
      <datalist id="formats">
        {STD_FORMATS.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      <Card>
        <CardHeader title="Video toevoegen" />
        <CardBody>
          <DeliverableForm action={addDeliverable.bind(null, id)} reset />
        </CardBody>
      </Card>
    </div>
  );
}

function DeliverableForm({ action, d, reset }: { action: Parameters<typeof ActionForm>[0]["action"]; d?: Deliverable; reset?: boolean }) {
  const k = d?.id ?? "new";
  const extra = (d?.formats ?? []).filter((f) => !STD_FORMATS.includes(f)).join(", ");
  return (
    <ActionForm action={action} resetOnSuccess={reset} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Naam" htmlFor={`d-n-${k}`} required className="lg:col-span-2">
        <Input id={`d-n-${k}`} name="name" defaultValue={d?.name} required maxLength={200} />
      </Field>
      <Field label="Geplande oplevering" htmlFor={`d-p-${k}`}>
        <Input id={`d-p-${k}`} name="planned_delivery_date" type="date" defaultValue={d?.planned_delivery_date ?? ""} />
      </Field>
      <Field label="Inbegrepen feedbackrondes" htmlFor={`d-r-${k}`}>
        <Input id={`d-r-${k}`} name="included_rounds" type="number" min={0} max={10} defaultValue={d?.included_rounds ?? 2} />
      </Field>
      <fieldset className="text-sm lg:col-span-2">
        <legend className="mb-1.5 font-semibold">Formaten</legend>
        <div className="flex flex-wrap gap-3">
          {STD_FORMATS.map((f) => (
            <label key={f} className="flex items-center gap-1.5">
              <Checkbox name="formats" value={f} defaultChecked={d?.formats.includes(f) ?? f === "16:9"} /> {f}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Andere formaten" htmlFor={`d-x-${k}`} hint="Komma-gescheiden">
        <Input id={`d-x-${k}`} name="formats_extra" defaultValue={extra} maxLength={200} />
      </Field>
      {d && (
        <Field label="Opgeleverd op" htmlFor={`d-o-${k}`}>
          <Input id={`d-o-${k}`} name="delivered_on" type="date" defaultValue={d.delivered_on ?? ""} />
        </Field>
      )}
      <Field label="Doel" htmlFor={`d-g-${k}`} className="sm:col-span-2">
        <Textarea id={`d-g-${k}`} name="goal" defaultValue={d?.goal} maxLength={2000} />
      </Field>
      <Field label="Afgesproken scope" htmlFor={`d-s-${k}`} className="sm:col-span-2">
        <Textarea id={`d-s-${k}`} name="scope" defaultValue={d?.scope} maxLength={4000} />
      </Field>
      <div>
        <SubmitButton size="sm">{d ? "Opslaan" : "Video toevoegen"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
