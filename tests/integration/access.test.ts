/**
 * Toegangsrechten, getest met echte beperkte sessies tegen de echte API (Supabase Auth +
 * PostgREST + RLS). Verwacht een verse ontwikkelseed (`npm run stack:reset && npm run db:seed`).
 */
import { describe, expect, it, beforeAll } from "vitest";
import { anon, as, projectId, service, userId } from "./helpers";

let P1: string; // Wervingscampagne (klant A, met portaal)
let P2: string; // Merkfilm (klant B, Joris geboekt)
let P5: string; // Museum (Joris niet geboekt)

beforeAll(async () => {
  P1 = await projectId("Wervingscampagne zorgpersoneel");
  P2 = await projectId("Merkfilm vakmanschap");
  P5 = await projectId("Expositietrailer 'Licht'");
});

describe("eigenaar", () => {
  it("ziet projecten en financiën", async () => {
    const lars = await as("owner");
    const { data: projects } = await lars.from("projects").select("id");
    const { count } = await service().from("projects").select("id", { count: "exact", head: true });
    expect(projects!.length).toBe(count);
    expect(count).toBeGreaterThanOrEqual(12);
    const { data: invoices, error } = await lars.schema("finance").from("invoices").select("id, amount_excl_cents");
    expect(error).toBeNull();
    expect(invoices!.length).toBeGreaterThanOrEqual(3);
  });
});

describe("medewerker / stagiaire", () => {
  it("ziet operationele projecten en taken", async () => {
    const s = await as("employee");
    const { data } = await s.from("projects").select("id, name");
    const { count } = await service().from("projects").select("id", { count: "exact", head: true });
    expect(data!.length).toBe(count);
    const { data: tasks } = await s.from("tasks").select("id").eq("project_id", P1).limit(5);
    expect(tasks!.length).toBe(5);
  });

  it("kan geen financiële records lezen via directe API-verzoeken", async () => {
    const s = await as("employee");
    for (const t of ["project_finances", "invoices", "payments", "costs", "extra_work", "booking_agreements", "followups", "documents"]) {
      const { data, error } = await s.schema("finance").from(t).select("*");
      // Ofwel een fout, ofwel nul rijen — nooit data.
      expect(error ? [] : data).toEqual([]);
    }
  });

  it("kan geen financiële records wijzigen of toevoegen", async () => {
    const s = await as("employee");
    const fin = s.schema("finance");
    const ins = await fin.from("invoices").insert({ project_id: P1, invoice_number: "HACK-1", issued_on: "2026-01-01", due_on: "2026-01-02", amount_excl_cents: 1 });
    expect(ins.error).not.toBeNull();
    const upd = await fin.from("project_finances").update({ quote_amount_cents: 1 }).eq("project_id", P1).select();
    expect(upd.error ? [] : upd.data).toEqual([]);
    const del = await fin.from("payments").delete().neq("id", "00000000-0000-0000-0000-000000000000").select();
    expect(del.error ? [] : del.data).toEqual([]);
    // Controle met service: bedrag ongewijzigd.
    const { data } = await service().schema("finance").from("project_finances").select("quote_amount_cents").eq("project_id", P1).single();
    expect(data!.quote_amount_cents).toBe(1850000);
  });

  it("ziet geen eigenaar-activiteit (financiële gebeurtenissen)", async () => {
    const s = await as("employee");
    const { data } = await s.from("activities").select("visibility, summary");
    expect(data!.length).toBeGreaterThan(0);
    expect(data!.every((a) => a.visibility === "staff")).toBe(true);
    expect(data!.some((a) => /^(Factuur|Betaling|Kostenpost|Meerwerk|Financiële)/.test(a.summary))).toBe(false);
  });

  it("kan de eigen rol niet verhogen of rollen beheren", async () => {
    const s = await as("employee");
    const me = await userId("employee");
    const r1 = await s.rpc("admin_set_role", { p_user: me, p_role: "owner" });
    expect(r1.error?.code).toBe("42501");
    const r2 = await s.from("user_roles").update({ role: "owner" }).eq("user_id", me).select();
    expect(r2.error).not.toBeNull();
    const r3 = await s.from("user_roles").insert({ user_id: me, role: "owner" });
    expect(r3.error).not.toBeNull();
    const { data } = await service().from("user_roles").select("role").eq("user_id", me).single();
    expect(data!.role).toBe("employee");
  });

  it("kan geen portaaltoegang of publicaties beheren", async () => {
    const s = await as("employee");
    const a = await s.from("portal_access").insert({ project_id: P2, user_id: await userId("clientA") });
    expect(a.error).not.toBeNull();
    const snap = await s.from("portal_snapshots").upsert({ project_id: P2, content: { project_name: "x" } });
    expect(snap.error).not.toBeNull();
  });

  it("kan geen freelancer aan een account koppelen", async () => {
    const s = await as("employee");
    const { data: f } = await s.from("freelancers").select("id").eq("name", "Mila Jansen").single();
    const r = await s.from("freelancers").update({ user_id: await userId("employee") }).eq("id", f!.id).select();
    expect(r.error).not.toBeNull();
  });

  it("kan geen extra feedbackronde openen (alleen eigenaar)", async () => {
    const s = await as("employee");
    const { data: d } = await s.from("deliverables").select("id").eq("name", "Portret verpleegkundige").single();
    const r = await s.from("feedback_rounds").insert({ deliverable_id: d!.id, round_number: 3, is_extra: true, extra_reason: "x", extra_approved_by: await userId("employee"), extra_approved_at: new Date().toISOString() });
    expect(r.error).not.toBeNull();
  });
});

describe("freelancer met account", () => {
  it("leest geen basistabellen", async () => {
    const f = await as("freelancer");
    for (const t of ["projects", "tasks", "clients", "contacts", "freelancers", "bookings", "task_comments", "activities", "deliverables"]) {
      const { data, error } = await f.from(t).select("*").limit(5);
      expect(error ? [] : data, t).toEqual([]);
    }
  });

  it("ziet alleen toegewezen projecten", async () => {
    const f = await as("freelancer");
    const { data, error } = await f.rpc("crew_projects");
    expect(error).toBeNull();
    const names = data!.map((p: { name: string }) => p.name).sort();
    expect(names).toEqual(["Interne update Q4", "Merkfilm vakmanschap", "Productvideo e-bike"]);
  });

  it("krijgt geen toegang tot een ander project via een gewijzigde project-ID", async () => {
    const f = await as("freelancer");
    const r = await f.rpc("crew_project", { p_project: P5 });
    expect(r.error?.code).toBe("42501");
  });

  it("ziet alleen gedeelde taken, crew-opmerkingen en crewdocumenten, zonder interne notities", async () => {
    const f = await as("freelancer");
    const { data, error } = await f.rpc("crew_project", { p_project: P2 });
    expect(error).toBeNull();
    expect(data.tasks.length).toBe(2);
    const json = JSON.stringify(data);
    expect(json).not.toContain("Intern: tarief");
    expect(json).not.toContain("Interne productienotities");
    expect(json).not.toContain("internal_notes");
    expect(json).not.toContain("06-22222222"); // telefoonnummer andere freelancer
    expect(data.documents.map((d: { title: string }) => d.title)).toEqual(["Shotlist (gedeeld met crew)"]);
    const { data: docs } = await f.from("documents").select("title");
    expect(docs!.map((d) => d.title)).toEqual(["Shotlist (gedeeld met crew)"]);
  });

  it("mag alleen toegestane taakvelden bijwerken", async () => {
    const f = await as("freelancer");
    const { data } = await f.rpc("crew_project", { p_project: P2 });
    const task = data.tasks[0];
    const first = task.checklist[0];
    const ok = await f.rpc("crew_update_task", { p_task: task.id, p_status: "bezig", p_checklist_done: { [first.id]: true } });
    expect(ok.error).toBeNull();
    const { data: row } = await service().from("tasks").select("status, checklist, title").eq("id", task.id).single();
    expect(row!.status).toBe("bezig");
    expect(row!.checklist[0].done).toBe(true);
    expect(row!.checklist[0].text).toBe(first.text);
    // Status buiten de toegestane set
    const bad = await f.rpc("crew_update_task", { p_task: task.id, p_status: "nvt" });
    expect(bad.error?.code).toBe("42501");
    // Directe update op tasks
    const direct = await f.from("tasks").update({ title: "gehackt" }).eq("id", task.id).select();
    expect(direct.error ? [] : direct.data).toEqual([]);
  });

  it("kan geen taak van een ander project of een niet-gedeelde taak wijzigen", async () => {
    const f = await as("freelancer");
    const { data: other } = await service().from("tasks").select("id").eq("project_id", P5).limit(1).single();
    const r = await f.rpc("crew_update_task", { p_task: other!.id, p_status: "klaar" });
    expect(r.error?.code).toBe("42501");
    const { data: notShared } = await service().from("tasks").select("id").eq("project_id", P2).eq("shared_with_freelancer", false).limit(1).single();
    const r2 = await f.rpc("crew_update_task", { p_task: notShared!.id, p_status: "klaar" });
    expect(r2.error?.code).toBe("42501");
  });

  it("heeft geen toegang tot financiën en portaal", async () => {
    const f = await as("freelancer");
    const { data } = await f.schema("finance").from("booking_agreements").select("*");
    expect(data ?? []).toEqual([]);
    const { data: snaps } = await f.from("portal_snapshots").select("*");
    expect(snaps).toEqual([]);
  });
});

describe("klantportaal", () => {
  it("klant A ziet alleen de eigen gepubliceerde momentopname", async () => {
    const a = await as("clientA");
    const { data } = await a.from("portal_snapshots").select("project_id, content");
    expect(data!.map((s) => s.project_id)).toEqual([P1]);
    const { data: other } = await a.from("portal_snapshots").select("*").eq("project_id", P2);
    expect(other).toEqual([]);
  });

  it("klant A kan geen interne gegevens van projecten lezen", async () => {
    const a = await as("clientA");
    for (const t of ["projects", "tasks", "task_comments", "bookings", "shoot_days", "deliverables", "documents", "portal_drafts", "activities"]) {
      const { data, error } = await a.from(t).select("*").limit(5);
      expect(error ? [] : data, t).toEqual([]);
    }
    const { data: fin } = await a.schema("finance").from("invoices").select("*");
    expect(fin ?? []).toEqual([]);
  });

  it("klant B kan niet bij project of publicatie van klant A", async () => {
    const b = await as("clientB");
    const { data } = await b.from("portal_snapshots").select("project_id");
    expect(data!.map((s) => s.project_id)).toEqual([P2]);
    const { data: a } = await b.from("portal_snapshots").select("*").eq("project_id", P1);
    expect(a).toEqual([]);
  });

  it("ingetrokken toegang wordt in de database geweigerd", async () => {
    const lars = await as("owner");
    const b = await as("clientB");
    const { data: access } = await lars.from("portal_access").select("id").eq("project_id", P2).is("revoked_at", null).single();
    await lars.from("portal_access").update({ revoked_at: new Date().toISOString() }).eq("id", access!.id);
    const { data } = await b.from("portal_snapshots").select("*");
    expect(data).toEqual([]);
    // herstellen
    await lars.from("portal_access").insert({ project_id: P2, user_id: await userId("clientB") });
    const { data: again } = await b.from("portal_snapshots").select("project_id");
    expect(again!.length).toBe(1);
  });

  it("een klant kan zichzelf geen toegang of rol geven", async () => {
    const a = await as("clientA");
    const me = await userId("clientA");
    expect((await a.from("portal_access").insert({ project_id: P2, user_id: me })).error).not.toBeNull();
    expect((await a.rpc("admin_set_role", { p_user: me, p_role: "employee" })).error?.code).toBe("42501");
  });
});

describe("niet ingelogd", () => {
  it("ziet niets", async () => {
    const c = anon();
    for (const t of ["projects", "tasks", "portal_snapshots", "profiles", "user_roles"]) {
      const { data, error } = await c.from(t).select("*").limit(1);
      expect(error ? [] : data, t).toEqual([]);
    }
    expect((await c.rpc("create_project", { p: { name: "x" } })).error).not.toBeNull();
    expect((await c.rpc("run_signal_scan", { p_today: "2026-01-01" })).error).not.toBeNull();
  });

  it("ingelogde gebruikers kunnen service-functies niet aanroepen", async () => {
    const lars = await as("owner");
    expect((await lars.rpc("run_signal_scan", { p_today: "2026-01-01" })).error).not.toBeNull();
    expect((await lars.rpc("process_quote_event", { p_source: "x", p_event_id: "1", p_type: "quote.created", p_external_id: "1", p_data: {} })).error).not.toBeNull();
    expect((await lars.rpc("claim_jobs", { p_worker: "x" })).error).not.toBeNull();
  });
});
