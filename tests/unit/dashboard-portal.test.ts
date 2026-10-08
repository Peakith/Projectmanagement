import { describe, expect, it } from "vitest";
import { buildRows, kpis, myActions, weekAgenda, applyFilters, type DashProject, type DashTask } from "@/lib/domain/dashboard";
import { buildSnapshot, portalDraftSchema } from "@/lib/domain/portal";
import { signPayload, verifySignature } from "@/lib/integrations/quotes";
import { toCsv } from "@/lib/csv";

const T = "2026-10-08";
const proj = (id: string, p: Partial<DashProject> = {}): DashProject => ({
  id, name: id, client_id: "c1", brand_id: "b1", lead_id: "lars", phase: "productie", deadline: "2026-10-09", health: "op_schema", health_note: "", priority: "normaal",
  next_action_task_id: null, next_action_text: "Bellen", next_action_assignee_id: "lars", next_action_date: T, next_action_needs_update: false, follow_up_date: null, ...p,
});
const task = (id: string, p: Partial<DashTask> = {}): DashTask => ({ id, project_id: "p1", title: id, status: "todo", due_date: null, optional: false, waiting_since: null, blocked_reason: null, assignee_id: null, priority: "normaal", phase: "productie", freelancer_id: null, ...p });

describe("dashboard", () => {
  const projects = [proj("p1"), proj("p2", { phase: "afgerond" }), proj("p3", { next_action_text: null })];
  const tasks = [task("t1", { due_date: "2026-10-01" }), task("t2", { due_date: "2026-10-01", optional: true }), task("t3", { status: "wacht_klant", project_id: "p3" })];
  const days = [{ id: "d1", project_id: "p1", shoot_date: "2026-10-09", start_time: null, location: "Studio", booking_statuses: ["bevestigd"] }];
  const rows = buildRows(projects, tasks, days, new Map([["c1", "Klant"]]), T);

  it("telt projecten (geen taken) en alleen niet-optionele achterstallige taken", () => {
    expect(kpis(rows, tasks, T)).toEqual({ active: 2, attention: 2, overdueTasks: 1, waitingClient: 1 });
  });
  it("draaidag telt één keer, ook met meerdere gekoppelde taken", () => {
    const a = weekAgenda(rows, [...tasks, task("t4", { due_date: "2026-10-09", priority: "hoog" })], days, [], T);
    expect(a.shoots.length).toBe(1);
    expect(a.deadlines.map((d) => d.kind).sort()).toEqual(["project_deadline", "project_deadline", "project_deadline", "task"]);
  });
  it("mijn acties vandaag", () => {
    expect(myActions(rows, [task("t9", { assignee_id: "lars", due_date: T })], "lars", T).map((a) => a.title)).toEqual(["Bellen", "Bellen", "t9"]);
  });
  it("filters op wachtstatus en deadline", () => {
    expect(applyFilters(rows, { wacht: "klant" }, T).map((r) => r.project.id)).toEqual(["p3"]);
    expect(applyFilters(rows, { deadline: "deze_week" }, T).length).toBe(3);
    expect(applyFilters(rows, { deadline: "verstreken" }, T).length).toBe(0);
  });
});

describe("klantpublicatie", () => {
  const src = {
    project: { name: "Film", client_name: "Klant A" },
    shoot_days: [{ shoot_date: "2026-10-10", start_time: "09:00:00", location: "Hal" }],
    deliverables: [
      { id: "00000000-0000-4000-8000-000000000001", name: "Video 1", planned_delivery_date: null, approved: false, delivered_on: null, waiting_for_feedback: true, latest_version: { version_number: 2, review_url: "https://vimeo.com/2" }, final_links: [{ label: "dl", url: "https://x.nl/a", is_final: true }] },
      { id: "00000000-0000-4000-8000-000000000002", name: "Geheim", planned_delivery_date: null, approved: false, delivered_on: null, waiting_for_feedback: false, latest_version: null, final_links: [] },
    ],
  };
  it("neemt alleen expliciet gekozen onderdelen over", () => {
    const draft = portalDraftSchema.parse({ next_step: "Feedback op v2", deliverable_ids: ["00000000-0000-4000-8000-000000000001"] });
    const snap = buildSnapshot(draft, src);
    expect(snap.shoot_days).toEqual([]);
    expect(snap.deliverables.length).toBe(1);
    expect(snap.deliverables[0].review_url).toBeNull();
    expect(snap.deliverables[0].final_links).toEqual([]);
    expect(snap.deliverables[0].status_label).toBe("Wacht op jullie feedback");
    expect(JSON.stringify(snap)).not.toContain("Geheim");
  });
  it("toont links en draaidagen alleen na expliciete keuze", () => {
    const draft = portalDraftSchema.parse({ show_shoot_days: true, show_review_links: true, show_final_links: true, deliverable_ids: ["00000000-0000-4000-8000-000000000001"] });
    const snap = buildSnapshot(draft, src);
    expect(snap.shoot_days.length).toBe(1);
    expect(snap.deliverables[0].review_url).toBe("https://vimeo.com/2");
    expect(snap.deliverables[0].final_links.length).toBe(1);
  });
});

describe("offerte-webhook signatuur", () => {
  const secret = "x".repeat(40);
  it("accepteert een geldige en weigert een vervalste of verouderde signatuur", () => {
    const body = '{"a":1}';
    const now = 1_800_000_000;
    expect(verifySignature(body, signPayload(body, secret, now), secret, now)).toBe(true);
    expect(verifySignature(body + " ", signPayload(body, secret, now), secret, now)).toBe(false);
    expect(verifySignature(body, signPayload(body, secret, now - 3600), secret, now)).toBe(false);
    expect(verifySignature(body, signPayload(body, "y".repeat(40), now), secret, now)).toBe(false);
    expect(verifySignature(body, null, secret, now)).toBe(false);
  });
});

describe("CSV-export", () => {
  it("beschermt tegen formule-injectie", () => {
    expect(toCsv([["=HYPERLINK(1)", "a;b"]])).toBe('﻿\'=HYPERLINK(1);"a;b"');
  });
});
