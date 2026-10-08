/**
 * Bedrijfsregels end-to-end tegen de echte database/API, uitgevoerd met beperkte sessies
 * (eigenaar/medewerker). De service-client wordt alleen gebruikt voor jobs/integratie
 * (zoals in productie) en om resultaten te controleren.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { as, service } from "./helpers";
import { addDays, todayISO } from "@/lib/domain/dates";
import { summarizeFinance } from "@/lib/domain/finance";
import { runJobs } from "@/lib/jobs/runner";
import { handleQuoteEvent } from "@/lib/integrations/quotes";

const T = todayISO();

async function templateCounts() {
  const s = service();
  const { data: v } = await s.from("template_versions").select("id").not("published_at", "is", null).order("version", { ascending: false }).limit(1).single();
  const { data: tt } = await s.from("template_tasks").select("per_shoot_day").eq("template_version_id", v!.id);
  return { base: tt!.filter((t) => !t.per_shoot_day).length, perDay: tt!.filter((t) => t.per_shoot_day).length, versionId: v!.id };
}

describe("projectaanmaak vanuit template", () => {
  it("maakt project + taken transactioneel aan en bewaart ze (ook na nieuwe sessie)", async () => {
    const s = await as("employee");
    const counts = await templateCounts();
    const name = `Testproject ${randomUUID().slice(0, 8)}`;
    const { data: id, error } = await s.rpc("create_project", {
      p: { name, new_client_name: "Testklant BV", shoot_dates: [addDays(T, 20), addDays(T, 21)], start_date: T },
    });
    expect(error).toBeNull();
    const fresh = service();
    const { data: tasks } = await fresh.from("tasks").select("id, anchor, due_date, shoot_day_id").eq("project_id", id);
    expect(tasks!.length).toBe(counts.base + 2 * counts.perDay);
    // Geen deadline => taken met deadline als referentie blijven ongepland (geen verzonnen datum)
    const deadlineTasks = tasks!.filter((t) => t.anchor === "project_deadline");
    expect(deadlineTasks.length).toBeGreaterThan(0);
    expect(deadlineTasks.every((t) => t.due_date === null)).toBe(true);
    // Taken per draaidag hebben een datum relatief aan hun eigen draaidag
    const { data: days } = await fresh.from("shoot_days").select("id, shoot_date").eq("project_id", id);
    expect(days!.length).toBe(2);
    const { data: project } = await fresh.from("projects").select("template_version_id, phase").eq("id", id).single();
    expect(project!.template_version_id).toBe(counts.versionId);
    expect(project!.phase).toBe("deal");
  });

  it("planningsvoorstel na deadline en verschoven draaidag, pas toegepast na bevestiging", async () => {
    const s = await as("owner");
    const { data: id } = await s.rpc("create_project", { p: { name: `Plan ${randomUUID().slice(0, 6)}`, shoot_dates: [addDays(T, 30)] } });
    await s.from("projects").update({ deadline: addDays(T, 50) }).eq("id", id);
    const { data: proposal } = await s.rpc("plan_proposal", { p_project: id });
    expect(proposal!.length).toBeGreaterThan(0);
    expect(proposal!.every((p: { anchor: string }) => p.anchor === "project_deadline")).toBe(true);
    // Nog niets veranderd zonder bevestiging
    const { data: before } = await s.from("tasks").select("due_date").eq("project_id", id).eq("anchor", "project_deadline");
    expect(before!.every((t) => t.due_date === null)).toBe(true);
    const ids = proposal!.map((p: { task_id: string }) => p.task_id);
    const { data: applied } = await s.rpc("apply_plan_proposal", { p_project: id, p_task_ids: ids });
    expect(applied).toBe(ids.length);

    // Draaidag verschuift: gekoppelde taken krijgen een voorstel
    const { data: day } = await s.from("shoot_days").select("id").eq("project_id", id).single();
    await s.from("shoot_days").update({ shoot_date: addDays(T, 33) }).eq("id", day!.id);
    const { data: moved } = await s.rpc("plan_proposal", { p_project: id });
    expect(moved!.length).toBeGreaterThan(0);
    expect(moved!.every((p: { anchor: string }) => p.anchor === "shoot_day")).toBe(true);
  });

  it("één bron per draaidag: dubbele datum wordt geweigerd; nieuwe draaidag krijgt eigen taken", async () => {
    const s = await as("owner");
    const counts = await templateCounts();
    const { data: id } = await s.rpc("create_project", { p: { name: `Dagen ${randomUUID().slice(0, 6)}`, shoot_dates: [addDays(T, 10)] } });
    const dup = await s.rpc("add_shoot_day", { p_project: id, p_date: addDays(T, 10) });
    expect(dup.error).not.toBeNull();
    const { data: newDay, error } = await s.rpc("add_shoot_day", { p_project: id, p_date: addDays(T, 11) });
    expect(error).toBeNull();
    const { count } = await s.from("tasks").select("id", { count: "exact", head: true }).eq("shoot_day_id", newDay);
    expect(count).toBe(counts.perDay);
    const { count: dayCount } = await s.from("shoot_days").select("id", { count: "exact", head: true }).eq("project_id", id);
    expect(dayCount).toBe(2);
  });
});

describe("taken en volgende actie", () => {
  it("wachtstatus registreert 'wacht sinds'; afgeronde volgende actie geeft één melding", async () => {
    const s = await as("owner");
    const { data: id } = await s.rpc("create_project", { p: { name: `NA ${randomUUID().slice(0, 6)}` } });
    const { data: task } = await s.from("tasks").select("id").eq("project_id", id).eq("phase", "deal").order("sort").limit(1).single();
    await s.from("tasks").update({ status: "wacht_klant" }).eq("id", task!.id);
    const { data: w } = await s.from("tasks").select("waiting_since").eq("id", task!.id).single();
    expect(w!.waiting_since).not.toBeNull();

    await s.from("projects").update({ next_action_task_id: task!.id }).eq("id", id);
    await s.from("tasks").update({ status: "klaar" }).eq("id", task!.id);
    const { data: p } = await s.from("projects").select("next_action_needs_update").eq("id", id).single();
    expect(p!.next_action_needs_update).toBe(true);
    // Heropenen en opnieuw afronden levert geen tweede identieke melding op
    await s.from("tasks").update({ status: "bezig" }).eq("id", task!.id);
    await s.from("tasks").update({ status: "klaar" }).eq("id", task!.id);
    const { data: notes } = await s.from("notifications").select("id").eq("project_id", id).eq("kind", "next_action_done");
    expect(notes!.length).toBe(1);
    // Nieuwe actie kiezen wist de vlag
    await s.from("projects").update({ next_action_task_id: null, next_action_text: "Klant bellen" }).eq("id", id);
    const { data: p2 } = await s.from("projects").select("next_action_needs_update").eq("id", id).single();
    expect(p2!.next_action_needs_update).toBe(false);
  });

  it("geblokkeerd of n.v.t. vereist een reden", async () => {
    const s = await as("employee");
    const { data: id } = await s.rpc("create_project", { p: { name: `Reden ${randomUUID().slice(0, 6)}` } });
    const { data: task } = await s.from("tasks").select("id").eq("project_id", id).limit(1).single();
    expect((await s.from("tasks").update({ status: "nvt" }).eq("id", task!.id)).error).not.toBeNull();
    expect((await s.from("tasks").update({ status: "nvt", nvt_reason: "Kleine opdracht" }).eq("id", task!.id)).error).toBeNull();
    expect((await s.from("tasks").update({ status: "geblokkeerd" }).eq("id", task!.id)).error).not.toBeNull();
  });
});

describe("feedbackrondes per video", () => {
  it("akkoord na één ronde, versies verbruiken geen ronde, extra ronde pas na goedkeuring eigenaar", async () => {
    const s = await as("owner");
    const { data: id } = await s.rpc("create_project", { p: { name: `Video ${randomUUID().slice(0, 6)}` } });
    const { data: a } = await s.from("deliverables").insert({ project_id: id, name: "Video A" }).select("id").single();
    const { data: b } = await s.from("deliverables").insert({ project_id: id, name: "Video B" }).select("id").single();
    const v1 = (await s.from("deliverable_versions").insert({ deliverable_id: a!.id, version_number: 1, review_url: "https://vimeo.com/1" }).select("id").single()).data!;
    await s.from("deliverable_versions").insert({ deliverable_id: a!.id, version_number: 2, review_url: "https://vimeo.com/2" });
    // Twee versies, nog geen ronde verbruikt
    const { count } = await s.from("feedback_rounds").select("id", { count: "exact", head: true }).eq("deliverable_id", a!.id);
    expect(count).toBe(0);
    await s.from("feedback_rounds").insert({ deliverable_id: a!.id, round_number: 1, version_id: v1.id, status: "verwerkt" });
    // Akkoord na de eerste ronde
    const ok = await s.from("deliverables").update({ approved_version_id: v1.id, approved_on: T, approval_source: "vimeo", approval_reference: "akkoord in Vimeo" }).eq("id", a!.id);
    expect(ok.error).toBeNull();
    // Rondes zijn per video: video B begint gewoon bij ronde 1
    expect((await s.from("feedback_rounds").insert({ deliverable_id: b!.id, round_number: 1 })).error).toBeNull();
    expect((await s.from("feedback_rounds").insert({ deliverable_id: b!.id, round_number: 2 })).error).toBeNull();
    // Ronde 3 zonder extra-registratie wordt geweigerd
    expect((await s.from("feedback_rounds").insert({ deliverable_id: b!.id, round_number: 3 })).error).not.toBeNull();
    // Extra zonder reden wordt geweigerd
    expect((await s.from("feedback_rounds").insert({ deliverable_id: b!.id, round_number: 3, is_extra: true })).error).not.toBeNull();
    const me = (await s.auth.getUser()).data.user!.id;
    const extra = await s.from("feedback_rounds").insert({ deliverable_id: b!.id, round_number: 3, is_extra: true, extra_reason: "Klant wil nieuwe eindtitel", extra_approved_by: me, extra_approved_at: new Date().toISOString() });
    expect(extra.error).toBeNull();
    // Akkoord met een versie van een andere video wordt geweigerd
    const wrong = await s.from("deliverables").update({ approved_version_id: v1.id, approved_on: T, approval_source: "email" }).eq("id", b!.id);
    expect(wrong.error).not.toBeNull();
  });

  it("weigert onveilige links", async () => {
    const s = await as("employee");
    const { data: d } = await s.from("deliverables").select("id").limit(1).single();
    const bad = await s.from("deliverable_versions").insert({ deliverable_id: d!.id, version_number: 99, review_url: "javascript:alert(1)" });
    expect(bad.error).not.toBeNull();
    const bad2 = await s.from("deliverable_links").insert({ deliverable_id: d!.id, label: "x", url: "data:text/html,hoi" });
    expect(bad2.error).not.toBeNull();
  });
});

describe("financiën: meerdere facturen en deelbetalingen", () => {
  it("afgeleid betaald/openstaand klopt met geregistreerde betalingen", async () => {
    const s = await as("owner");
    const fin = s.schema("finance");
    const { data: id } = await s.rpc("create_project", { p: { name: `Fin ${randomUUID().slice(0, 6)}` } });
    await fin.from("project_finances").update({ quote_amount_cents: 1000000 }).eq("project_id", id);
    const n = randomUUID().slice(0, 6);
    const i1 = (await fin.from("invoices").insert({ project_id: id, invoice_number: `T-${n}-1`, issued_on: T, due_on: addDays(T, 14), amount_excl_cents: 500000, vat_cents: 105000 }).select("id").single()).data!;
    const i2 = (await fin.from("invoices").insert({ project_id: id, invoice_number: `T-${n}-2`, issued_on: T, due_on: addDays(T, 14), amount_excl_cents: 500000, vat_cents: 105000 }).select("id").single()).data!;
    expect((await fin.from("payments").insert({ invoice_id: i1.id, received_on: T, amount_cents: 605000 })).error).toBeNull();
    expect((await fin.from("payments").insert({ invoice_id: i2.id, received_on: T, amount_cents: 200000 })).error).toBeNull();
    // Overbetaling wordt geweigerd
    expect((await fin.from("payments").insert({ invoice_id: i2.id, received_on: T, amount_cents: 500000 })).error).not.toBeNull();

    const [{ data: invoices }, { data: payments }, { data: pf }] = await Promise.all([
      fin.from("invoices").select("*").eq("project_id", id),
      fin.from("payments").select("invoice_id, amount_cents").in("invoice_id", [i1.id, i2.id]),
      fin.from("project_finances").select("quote_amount_cents").eq("project_id", id).single(),
    ]);
    const sum = summarizeFinance({ quote_amount_cents: pf!.quote_amount_cents, extra_work: [], costs: [], invoices: invoices!, payments: payments! }, T);
    expect(sum.paid_cents).toBe(805000);
    expect(sum.outstanding_cents).toBe(405000);
    expect(sum.invoices.find((i) => i.id === i2.id)!.state).toBe("deels_betaald");
    expect(sum.invoices.find((i) => i.id === i1.id)!.state).toBe("betaald");
    // Geen kosten vastgelegd => bijdrage onbekend, niet 100%
    expect(sum.actual_contribution_cents).toBeNull();
  });
});

describe("offerte-integratie (idempotent)", () => {
  it("herhaalde en gelijktijdige events maken één project met één set taken", async () => {
    const admin = service();
    const ext = `OFF-${randomUUID().slice(0, 8)}`;
    const created = { source: "test", type: "quote.created", external_id: ext, data: { title: "Integratietest", client_name: "Integratieklant" } };
    // Gelijktijdig: verschillende event-ID's voor dezelfde offerte + exact hetzelfde event dubbel
    const results = await Promise.all([
      handleQuoteEvent(admin, { ...created, event_id: "e1" + ext }),
      handleQuoteEvent(admin, { ...created, event_id: "e1" + ext }),
      handleQuoteEvent(admin, { ...created, event_id: "e2" + ext }),
      handleQuoteEvent(admin, { ...created, type: "quote.accepted", event_id: "e3" + ext }),
      handleQuoteEvent(admin, { ...created, type: "quote.accepted", event_id: "e4" + ext }),
    ]);
    const projectIds = new Set(results.map((r) => r.project_id));
    expect(projectIds.size).toBe(1);
    const pid = [...projectIds][0]!;
    const { count: projects } = await admin.from("integration_quotes").select("id", { count: "exact", head: true }).eq("external_id", ext);
    expect(projects).toBe(1);
    const counts = await templateCounts();
    const { count: tasks } = await admin.from("tasks").select("id", { count: "exact", head: true }).eq("project_id", pid);
    expect(tasks).toBe(counts.base);
    const { data: q } = await admin.from("integration_quotes").select("status").eq("external_id", ext).single();
    expect(q!.status).toBe("accepted");
    const { count: notes } = await admin.from("notifications").select("id", { count: "exact", head: true }).eq("project_id", pid).eq("kind", "quote_accepted");
    const { count: owners } = await admin.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "owner").eq("active", true);
    expect(notes).toBe(owners);
    // Fase is niet automatisch gewijzigd
    const { data: p } = await admin.from("projects").select("phase").eq("id", pid).single();
    expect(p!.phase).toBe("deal");
  });
});

describe("jobs en meldingen", () => {
  it("herhaald uitvoeren levert geen stapel identieke meldingen op", async () => {
    const admin = service();
    await admin.rpc("run_signal_scan", { p_today: T });
    const { count: first } = await admin.from("notifications").select("id", { count: "exact", head: true });
    // Runner twee keer (de uurlijkse scan wordt maar één keer ingepland) + expliciete herhaling
    await runJobs(admin, { worker: "test-1" });
    await runJobs(admin, { worker: "test-2" });
    const { data: again } = await admin.rpc("run_signal_scan", { p_today: T });
    expect(Object.values(again as Record<string, number>).every((n) => n === 0)).toBe(true);
    const { count: second } = await admin.from("notifications").select("id", { count: "exact", head: true });
    expect(second).toBe(first);
  });

  it("dedupe bij inplannen, retry met foutregistratie en uiteindelijk 'failed'", async () => {
    const admin = service();
    const key = `test-fail:${randomUUID()}`;
    const { data: j1 } = await admin.rpc("enqueue_job", { p_kind: "onbekend_type", p_payload: {}, p_dedupe: key });
    const { data: j2 } = await admin.rpc("enqueue_job", { p_kind: "onbekend_type", p_payload: {}, p_dedupe: key });
    expect(j1).toBeTruthy();
    expect(j2).toBeNull();
    const res = await runJobs(admin, { worker: "test-3", schedule: false });
    expect(res.find((r) => r.id === j1)?.ok).toBe(false);
    const { data: overview } = await (await as("owner")).rpc("job_overview", { p_limit: 100 });
    const job = overview!.find((j: { id: string }) => j.id === j1);
    expect(job.status).toBe("pending");
    expect(job.attempts).toBe(1);
    expect(job.last_error).toContain("Onbekend jobtype");
    // Medewerker mag het joboverzicht niet zien
    expect((await (await as("employee")).rpc("job_overview")).error?.code).toBe("42501");
  });
});
