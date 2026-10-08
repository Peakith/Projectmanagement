import { z } from "zod";
import { isSafeUrl } from "./urls";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Concept van de klantpublicatie. Bevat keuzes, nooit automatisch gekopieerde interne velden. */
export const portalDraftSchema = z.object({
  phase_label: z.string().trim().max(80).default(""),
  goal: z.string().trim().max(2000).default(""),
  scope: z.string().trim().max(4000).default(""),
  next_step: z.string().trim().max(500).default(""),
  next_step_date: isoDate.nullable().default(null),
  milestones: z
    .array(z.object({ title: z.string().trim().min(1).max(200), date: isoDate.nullable() }))
    .max(30)
    .default([]),
  show_shoot_days: z.boolean().default(false),
  deliverable_ids: z.array(z.uuid()).max(50).default([]),
  show_review_links: z.boolean().default(false),
  show_final_links: z.boolean().default(false),
});
export type PortalDraft = z.infer<typeof portalDraftSchema>;
export const emptyDraft = (): PortalDraft => portalDraftSchema.parse({});

export const CLIENT_PHASE_SUGGESTIONS = [
  "Voorbereiding",
  "Concept",
  "Voorbereiding opnames",
  "Opnames",
  "Montage",
  "Review",
  "Afronding",
  "Opgeleverd",
];

export type PortalSnapshot = {
  project_name: string;
  client_name: string | null;
  phase_label: string;
  goal: string;
  scope: string;
  next_step: string;
  next_step_date: string | null;
  milestones: { title: string; date: string | null }[];
  shoot_days: { date: string; start_time: string | null; location: string }[];
  deliverables: {
    name: string;
    planned_delivery_date: string | null;
    status_label: string;
    review_url: string | null;
    version_number: number | null;
    final_links: { label: string; url: string }[];
  }[];
};

export type SnapshotSource = {
  project: { name: string; client_name: string | null };
  shoot_days: { shoot_date: string; start_time: string | null; location: string }[];
  deliverables: {
    id: string;
    name: string;
    planned_delivery_date: string | null;
    approved: boolean;
    delivered_on: string | null;
    waiting_for_feedback: boolean;
    latest_version: { version_number: number; review_url: string | null } | null;
    final_links: { label: string; url: string; is_final: boolean }[];
  }[];
};

export function clientDeliverableStatus(d: SnapshotSource["deliverables"][number]): string {
  if (d.delivered_on) return "Opgeleverd";
  if (d.approved) return "Goedgekeurd";
  if (d.waiting_for_feedback) return "Wacht op jullie feedback";
  if (d.latest_version) return "In review";
  return "In productie";
}

/** Bouwt de momentopname die de klant ziet. Dezelfde functie voedt de preview. */
export function buildSnapshot(draft: PortalDraft, src: SnapshotSource): PortalSnapshot {
  const selected = draft.deliverable_ids
    .map((id) => src.deliverables.find((d) => d.id === id))
    .filter((d): d is NonNullable<typeof d> => !!d);
  return {
    project_name: src.project.name,
    client_name: src.project.client_name,
    phase_label: draft.phase_label,
    goal: draft.goal,
    scope: draft.scope,
    next_step: draft.next_step,
    next_step_date: draft.next_step_date,
    milestones: draft.milestones,
    shoot_days: draft.show_shoot_days
      ? src.shoot_days
          .map((s) => ({ date: s.shoot_date, start_time: s.start_time, location: s.location }))
          .sort((a, b) => a.date.localeCompare(b.date))
      : [],
    deliverables: selected.map((d) => ({
      name: d.name,
      planned_delivery_date: d.planned_delivery_date,
      status_label: clientDeliverableStatus(d),
      review_url:
        draft.show_review_links && d.latest_version?.review_url && isSafeUrl(d.latest_version.review_url)
          ? d.latest_version.review_url
          : null,
      version_number: d.latest_version?.version_number ?? null,
      final_links: draft.show_final_links
        ? d.final_links.filter((l) => l.is_final && isSafeUrl(l.url)).map((l) => ({ label: l.label, url: l.url }))
        : [],
    })),
  };
}
