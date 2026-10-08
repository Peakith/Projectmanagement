import "server-only";
import type { Session } from "@/lib/auth";
import type { SnapshotSource } from "@/lib/domain/portal";

/** Bron voor een klantpublicatie (alleen eigenaar roept dit aan). */
export async function loadSnapshotSource(db: Session["supabase"], projectId: string): Promise<SnapshotSource> {
  const [{ data: p }, { data: days }, { data: ds }] = await Promise.all([
    db.from("projects").select("name, clients(name)").eq("id", projectId).single(),
    db.from("shoot_days").select("shoot_date, start_time, location").eq("project_id", projectId).order("shoot_date"),
    db.from("deliverables").select("id, name, planned_delivery_date, approved_version_id, delivered_on").eq("project_id", projectId).order("sort"),
  ]);
  const ids = (ds ?? []).map((d) => d.id);
  const [{ data: versions }, { data: rounds }, { data: links }] = ids.length
    ? await Promise.all([
        db.from("deliverable_versions").select("deliverable_id, version_number, review_url").in("deliverable_id", ids).order("version_number"),
        db.from("feedback_rounds").select("deliverable_id, status").in("deliverable_id", ids),
        db.from("deliverable_links").select("deliverable_id, label, url, is_final").in("deliverable_id", ids),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  return {
    project: { name: p?.name ?? "", client_name: (p?.clients as unknown as { name: string } | null)?.name ?? null },
    shoot_days: (days ?? []).map((d) => ({ shoot_date: d.shoot_date, start_time: d.start_time, location: d.location })),
    deliverables: (ds ?? []).map((d) => {
      const vs = (versions ?? []).filter((v) => v.deliverable_id === d.id);
      const latest = vs.at(-1);
      return {
        id: d.id,
        name: d.name,
        planned_delivery_date: d.planned_delivery_date,
        approved: !!d.approved_version_id,
        delivered_on: d.delivered_on,
        waiting_for_feedback: (rounds ?? []).some((r) => r.deliverable_id === d.id && r.status === "wacht_op_feedback"),
        latest_version: latest ? { version_number: latest.version_number, review_url: latest.review_url } : null,
        final_links: (links ?? []).filter((l) => l.deliverable_id === d.id),
      };
    }),
  };
}
