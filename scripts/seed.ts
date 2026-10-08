/**
 * ONTWIKKELSEED — fictieve demodata en echte testaccounts met echte rechten.
 *
 *  - Draait alleen tegen een lokale Supabase (127.0.0.1/localhost) en nooit met NODE_ENV=production.
 *  - Wachtwoord komt uit SEED_PASSWORD (of wordt willekeurig gegenereerd en getoond).
 *  - Verwacht een lege database: gebruik eerst `npm run stack:reset` of `npx supabase db reset`.
 *
 * Projecten worden aangemaakt door in te loggen als de eigenaar en dezelfde
 * create_project()-functie te gebruiken als de app (inclusief template en RLS).
 */
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, findUserByEmail, isLocalUrl, SUPABASE_URL, userClient } from "./lib/script-env";
import { addDays, todayISO, weekStart } from "../src/lib/domain/dates";
import { PHASES, type Phase } from "../src/lib/domain/labels";

const url = SUPABASE_URL();
if (!isLocalUrl(url) || process.env.NODE_ENV === "production") {
  console.error("Geweigerd: de ontwikkelseed draait alleen tegen een lokale Supabase en niet in productie.");
  process.exit(1);
}
const password = process.env.SEED_PASSWORD || randomBytes(9).toString("base64url");

export const SEED_USERS = {
  owner: { email: "lars@studiobrutaal.test", name: "Lars (eigenaar)", role: "owner" },
  employee: { email: "stagiaire@studiobrutaal.test", name: "Sanne (stagiaire)", role: "employee" },
  freelancer: { email: "joris@freelance.test", name: "Joris de Vries", role: "freelancer" },
  clientA: { email: "klant-a@rivierstad.test", name: "Femke (Gemeente Rivierstad)", role: "client" },
  clientB: { email: "klant-b@korrel.test", name: "Ahmed (Bakkerij Korrel)", role: "client" },
} as const;

const T = todayISO();
const d = (n: number) => addDays(T, n);
const thisMonday = weekStart(T);

function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

async function ensureUser(admin: SupabaseClient, u: { email: string; name: string; role: string }) {
  let user = await findUserByEmail(admin, u.email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: u.name },
    });
    if (error) throw error;
    user = data.user;
  } else {
    await admin.auth.admin.updateUserById(user.id, { password });
  }
  must(await admin.from("profiles").upsert({ id: user.id, email: u.email, full_name: u.name }), "profiel");
  // Seed gebruikt de service-sleutel om rollen te zetten (zoals het eigenaar-script).
  must(await admin.from("user_roles").upsert({ user_id: user.id, role: u.role, active: true }), "rol");
  return user.id;
}

async function main() {
  const admin = adminClient();
  const { count } = await admin.from("projects").select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) {
    console.error("Er staan al projecten in de database. Reset eerst: `npm run stack:reset` of `npx supabase db reset`.");
    process.exit(1);
  }

  const ids: Record<keyof typeof SEED_USERS, string> = {} as never;
  for (const [key, u] of Object.entries(SEED_USERS)) ids[key as keyof typeof SEED_USERS] = await ensureUser(admin, u);

  const lars = await userClient(SEED_USERS.owner.email, password);

  // Klanten
  const clientNames = [
    "Gemeente Rivierstad",
    "Bakkerij Korrel",
    "Fietsfabriek Noord",
    "Museum Zuid",
    "Zorggroep Oost",
    "Techbedrijf Lumen",
    "Hogeschool West",
    "Brouwerij Hop & Co",
    "Sportclub Vooruit",
    "Studio Brutaal (intern)",
  ];
  const clients: Record<string, string> = {};
  for (const name of clientNames) {
    const row = must(await lars.from("clients").insert({ name }).select("id").single(), "klant");
    clients[name] = row.id;
  }
  must(
    await lars.from("contacts").insert([
      { client_id: clients["Gemeente Rivierstad"], name: "Femke Bos", role: "Communicatieadviseur", email: "klant-a@rivierstad.test" },
      { client_id: clients["Bakkerij Korrel"], name: "Ahmed El Idrissi", role: "Eigenaar", email: "klant-b@korrel.test", phone: "06-00000000" },
      { client_id: clients["Museum Zuid"], name: "Ilse de Wit", role: "Marketing", email: "ilse@museumzuid.test" },
    ]),
    "contacten",
  );

  // Freelancers: één met account (beperkte toegang), één zonder account
  const fJoris = must(
    await lars
      .from("freelancers")
      .insert({ name: "Joris de Vries", specialisms: ["Camera", "Licht"], email: SEED_USERS.freelancer.email, phone: "06-11111111", city: "Utrecht", availability: "beschikbaar", notes: "Eigen FX6-set. Interne notitie: werkt graag met vaste gaffer." })
      .select("id")
      .single(),
    "freelancer",
  ).id;
  must(await lars.rpc("admin_link_freelancer", { p_freelancer: fJoris, p_user: ids.freelancer }), "koppelen freelancer");
  const fMila = must(
    await lars
      .from("freelancers")
      .insert({ name: "Mila Jansen", specialisms: ["Montage", "Kleur"], email: "mila@freelance.test", city: "Amsterdam", availability: "beperkt", availability_note: "Max. 3 dagen per week" })
      .select("id")
      .single(),
    "freelancer",
  ).id;
  const fSam = must(
    await lars.from("freelancers").insert({ name: "Sam Peters", specialisms: ["Sound"], phone: "06-22222222", city: "Rotterdam" }).select("id").single(),
    "freelancer",
  ).id;

  async function project(p: Record<string, unknown>): Promise<string> {
    return must(await lars.rpc("create_project", { p }), `project ${p.name}`) as string;
  }

  /** Zet fase en markeer taken uit eerdere fases als klaar (zoals een lopend project eruitziet). */
  async function advance(id: string, phase: Phase, opts: { completeCurrent?: number } = {}) {
    const idx = PHASES.indexOf(phase);
    const before = PHASES.slice(0, Math.min(idx, 8));
    if (before.length) must(await lars.from("tasks").update({ status: "klaar" }).eq("project_id", id).in("phase", before), "taken afronden");
    if (opts.completeCurrent) {
      const { data } = await lars.from("tasks").select("id").eq("project_id", id).eq("phase", phase).order("sort").limit(opts.completeCurrent);
      if (data?.length) must(await lars.from("tasks").update({ status: "klaar" }).in("id", data.map((t) => t.id)), "taken");
    }
    must(await lars.from("projects").update({ phase }).eq("id", id), "fase");
  }

  async function task(projectId: string, titleStart: string) {
    const { data } = await lars.from("tasks").select("id, title").eq("project_id", projectId).ilike("title", `${titleStart}%`).order("sort").limit(1).single();
    if (!data) throw new Error(`Taak "${titleStart}" niet gevonden`);
    return data.id as string;
  }
  async function setTask(projectId: string, titleStart: string, patch: Record<string, unknown>) {
    const id = await task(projectId, titleStart);
    must(await lars.from("tasks").update(patch).eq("id", id), `taak ${titleStart}`);
    return id;
  }
  async function nextAction(projectId: string, taskId: string | null, extra: Record<string, unknown> = {}) {
    must(await lars.from("projects").update({ next_action_task_id: taskId, ...extra }).eq("id", projectId), "volgende actie");
  }
  async function backdateWaiting(taskId: string, workdaysAgoCalendar: number) {
    // Alleen voor de seed: de wachttijd in het verleden laten beginnen.
    must(await admin.from("tasks").update({ waiting_since: `${d(-workdaysAgoCalendar)}T09:00:00+02:00` }).eq("id", taskId), "wacht sinds");
  }
  async function deliverable(projectId: string, row: Record<string, unknown>) {
    return must(await lars.from("deliverables").insert({ project_id: projectId, ...row }).select("id").single(), "deliverable").id as string;
  }
  async function version(deliverableId: string, n: number, on: string, url: string) {
    return must(
      await lars.from("deliverable_versions").insert({ deliverable_id: deliverableId, version_number: n, delivered_on: on, review_url: url }).select("id").single(),
      "versie",
    ).id as string;
  }
  async function booking(projectId: string, freelancerId: string, role: string, status: string, shootDayIds: string[], work = "") {
    const b = must(
      await lars.from("bookings").insert({ project_id: projectId, freelancer_id: freelancerId, role, status, work_description: work }).select("id").single(),
      "boeking",
    );
    if (shootDayIds.length) must(await lars.from("booking_shoot_days").insert(shootDayIds.map((s) => ({ booking_id: b.id, shoot_day_id: s }))), "boeking-draaidag");
    return b.id as string;
  }
  async function shootDays(projectId: string) {
    const { data } = await lars.from("shoot_days").select("id, shoot_date").eq("project_id", projectId).order("shoot_date");
    return (data ?? []) as { id: string; shoot_date: string }[];
  }

  // 1. Rivierstad — post-productie, 3 video's met verschillende feedbackstatus, wacht op klant
  const p1 = await project({
    name: "Wervingscampagne zorgpersoneel",
    client_id: clients["Gemeente Rivierstad"],
    project_type: "Campagne",
    goal: "Meer sollicitaties voor zorgfuncties in de regio.",
    briefing: "Drie korte portretten van zorgmedewerkers voor social en website.",
    target_audience: "Zij-instromers 25–45 jaar",
    start_date: d(-60),
    deadline: d(12),
    shoot_dates: [d(-20), d(-19)],
    priority: "hoog",
  });
  await advance(p1, "postproductie", { completeCurrent: 5 });
  const d1a = await deliverable(p1, { name: "Portret verpleegkundige", formats: ["16:9", "9:16"], planned_delivery_date: d(10), scope: "60 sec + 15 sec cutdown" });
  const d1b = await deliverable(p1, { name: "Portret thuiszorg", formats: ["16:9", "9:16"], planned_delivery_date: d(10) });
  const d1c = await deliverable(p1, { name: "Portret helpende", formats: ["16:9", "1:1"], planned_delivery_date: d(12) });
  const v1a1 = await version(d1a, 1, d(-9), "https://vimeo.com/review/111111111");
  const v1a2 = await version(d1a, 2, d(-3), "https://vimeo.com/review/111111112");
  must(await lars.from("feedback_rounds").insert({ deliverable_id: d1a, round_number: 1, version_id: v1a1, status: "verwerkt", requested_on: d(-9), received_on: d(-6), processed_on: d(-4) }), "ronde");
  must(await lars.from("feedback_rounds").insert({ deliverable_id: d1a, round_number: 2, version_id: v1a2, status: "verwerkt", requested_on: d(-3), received_on: d(-2), processed_on: d(-1) }), "ronde");
  const v1b1 = await version(d1b, 1, d(-8), "https://vimeo.com/review/222222221");
  must(await lars.from("feedback_rounds").insert({ deliverable_id: d1b, round_number: 1, version_id: v1b1, status: "wacht_op_feedback", requested_on: d(-8), feedback_due: d(-3) }), "ronde");
  const v1c1 = await version(d1c, 1, d(-5), "https://vimeo.com/review/333333331");
  must(await lars.from("feedback_rounds").insert({ deliverable_id: d1c, round_number: 1, version_id: v1c1, status: "verwerkt", requested_on: d(-5), received_on: d(-4), processed_on: d(-4) }), "ronde");
  // Akkoord na de eerste ronde
  must(await lars.from("deliverables").update({ approved_version_id: v1c1, approved_on: d(-3), approval_source: "email", approval_reference: "Mail Femke 'helemaal goed zo'" }).eq("id", d1c), "akkoord");
  const fb1 = await setTask(p1, "Feedbackronde 1", { status: "wacht_klant", follow_up_date: d(1) });
  await backdateWaiting(fb1, 7);
  await nextAction(p1, fb1, { next_action_date: d(1) });
  must(await lars.from("projects").update({ lead_id: ids.owner }).eq("id", p1), "lead");
  must(await lars.from("portal_access").insert({ project_id: p1, user_id: ids.clientA }), "portaaltoegang A");

  // 2. Bakkerij Korrel — pre-productie, twee draaidagen deze/volgende week, freelancer met account
  const p2 = await project({
    name: "Merkfilm vakmanschap",
    client_id: clients["Bakkerij Korrel"],
    project_type: "Merkfilm",
    goal: "Het ambacht achter het brood zichtbaar maken.",
    briefing: "Eén merkfilm van 90 sec en drie social cutdowns.",
    start_date: d(-30),
    deadline: d(35),
    shoot_dates: [d(3), d(4)],
    lead_id: ids.employee,
  });
  await advance(p2, "preproductie", { completeCurrent: 4 });
  const sd2 = await shootDays(p2);
  must(await lars.from("shoot_days").update({ start_time: "05:30", end_time: "14:00", location: "Bakkerij Korrel", address: "Molenstraat 1, Utrecht", schedule: "05:30 opbouw\n06:00 deegbereiding\n09:00 winkel open\n12:00 interviews", callsheet_url: "https://docs.example.com/callsheet-korrel-dag1", crew_notes: "Parkeren achter de bakkerij. Meel in de lucht: lenzen afdekken." }).eq("id", sd2[0].id), "draaidag");
  must(await lars.from("projects").update({ crew_briefing: "Warm, eerlijk, vroeg in de ochtend. Focus op handen en vakmanschap. Geen gezichten van klanten zonder toestemming." }).eq("id", p2), "crewbriefing");
  await booking(p2, fJoris, "Camera", "bevestigd", sd2.map((s) => s.id), "Camera en licht, beide draaidagen");
  await booking(p2, fSam, "Sound", "optie", [sd2[0].id], "Geluid bij interviews");
  const t2 = await setTask(p2, "Apparatuur ophalen", { freelancer_id: fJoris, shared_with_freelancer: true, assignee_id: ids.employee });
  await setTask(p2, "Briefing en callsheet", { freelancer_id: fJoris, shared_with_freelancer: true, assignee_id: ids.employee, status: "bezig" });
  must(await lars.from("task_comments").insert({ task_id: t2, body: "Graag ook de lichtkoffer meenemen.", visible_to_crew: true }), "opmerking");
  must(await lars.from("task_comments").insert({ task_id: t2, body: "Intern: tarief Joris nog afstemmen.", visible_to_crew: false }), "opmerking");
  await nextAction(p2, await task(p2, "Freelancers en crew boeken"), { next_action_assignee_id: ids.employee, next_action_date: d(1) });
  must(await lars.from("documents").insert([
    { project_id: p2, title: "Shotlist (gedeeld met crew)", kind: "link", url: "https://docs.example.com/shotlist-korrel", visibility: "crew" },
    { project_id: p2, title: "Interne productienotities", kind: "link", url: "https://docs.example.com/intern-korrel", visibility: "internal" },
  ]), "documenten");
  must(await lars.from("portal_access").insert({ project_id: p2, user_id: ids.clientB }), "portaaltoegang B");

  // 3 + 4. Mogelijke crew-overlap: Joris bevestigd op dezelfde datum in twee projecten
  const overlapDate = d(9);
  const p3 = await project({ name: "Interne update Q4", client_id: clients["Gemeente Rivierstad"], project_type: "Interne video", start_date: d(-14), deadline: d(25), shoot_dates: [overlapDate], lead_id: ids.owner });
  await advance(p3, "preproductie", { completeCurrent: 2 });
  await booking(p3, fJoris, "Camera", "bevestigd", (await shootDays(p3)).map((s) => s.id));
  await nextAction(p3, await task(p3, "Productiedocument"), { next_action_date: d(2) });

  const p4 = await project({ name: "Productvideo e-bike", client_id: clients["Fietsfabriek Noord"], project_type: "Productvideo", start_date: d(-20), deadline: d(30), shoot_dates: [overlapDate, d(10)], lead_id: ids.owner });
  await advance(p4, "preproductie", { completeCurrent: 6 });
  const sd4 = await shootDays(p4);
  await booking(p4, fJoris, "Camera", "bevestigd", [sd4[0].id]);
  await booking(p4, fMila, "Montage", "aangevraagd", [], "Montage na de draaidagen; heeft geen account");
  await setTask(p4, "Montage per video", { freelancer_id: fMila, assignee_id: ids.employee });
  await nextAction(p4, null, { next_action_text: "Locatie fabriekshal bevestigen", next_action_assignee_id: ids.employee, next_action_date: d(0) });

  // 5. Museum Zuid — strategie, wacht al 6 werkdagen op de klant
  const p5 = await project({ name: "Expositietrailer 'Licht'", client_id: clients["Museum Zuid"], project_type: "Trailer", start_date: d(-25), deadline: d(40) });
  await advance(p5, "strategie", { completeCurrent: 3 });
  const w5 = await setTask(p5, "Concept met klant afstemmen", { status: "wacht_klant", follow_up_date: d(-1) });
  await backdateWaiting(w5, 9);
  await nextAction(p5, w5, { next_action_date: d(-1) });

  // 6. Showreel — post-productie zonder eerstvolgende actie
  const p6 = await project({ name: "Showreel 2026", client_id: clients["Studio Brutaal (intern)"], project_type: "Showreel", start_date: d(-10), deadline: d(20), priority: "laag" });
  await advance(p6, "postproductie");
  must(await lars.from("tasks").update({ status: "nvt", nvt_reason: "Intern project zonder klantrondes" }).eq("project_id", p6).ilike("title", "Feedbackronde%"), "nvt");
  await deliverable(p6, { name: "Showreel 2026", formats: ["16:9"], planned_delivery_date: d(20), included_rounds: 0 });

  // 7. Zorggroep Oost — deal, offerte wordt opgevolgd (wacht op klant)
  const p7 = await project({ name: "Recruitmentserie", client_id: clients["Zorggroep Oost"], project_type: "Serie", start_date: d(-12), priority: "hoog" });
  await advance(p7, "deal", { completeCurrent: 6 });
  const w7 = await setTask(p7, "Offerte opvolgen", { status: "wacht_klant", follow_up_date: d(2) });
  await backdateWaiting(w7, 2);
  await nextAction(p7, w7, { next_action_date: d(2) });

  // 8. Lumen — oplevering, deels betaalde factuur
  const p8 = await project({ name: "Event aftermovie", client_id: clients["Techbedrijf Lumen"], project_type: "Aftermovie", start_date: d(-50), deadline: d(-5), shoot_dates: [d(-30)] });
  await advance(p8, "oplevering", { completeCurrent: 2 });
  const d8 = await deliverable(p8, { name: "Aftermovie", formats: ["16:9", "9:16"], planned_delivery_date: d(-5), delivered_on: d(-4) });
  const v8 = await version(d8, 3, d(-6), "https://vimeo.com/review/888888883");
  must(await lars.from("deliverables").update({ approved_version_id: v8, approved_on: d(-5), approval_source: "vimeo", approval_reference: "Goedgekeurd in Vimeo review" }).eq("id", d8), "akkoord");
  must(await lars.from("deliverable_links").insert({ deliverable_id: d8, label: "Download 16:9 (master)", url: "https://files.example.com/lumen/aftermovie-16x9.mp4", format: "16:9" }), "link");
  await nextAction(p8, await task(p8, "Archivering en back-up"), { next_action_date: d(2) });

  // 9. Hogeschool — evaluatie
  const p9 = await project({ name: "Open dag campagne", client_id: clients["Hogeschool West"], project_type: "Campagne", start_date: d(-90), deadline: d(-25), shoot_dates: [d(-50)] });
  await advance(p9, "evaluatie");
  await nextAction(p9, await task(p9, "Interne debrief"), { next_action_date: d(3) });

  // 10. Brouwerij — deal met een achterstallige taak en meerdere toekomstige draaidagen
  const p10 = await project({ name: "Social cutdowns zomerbier", client_id: clients["Brouwerij Hop & Co"], project_type: "Social", start_date: d(-8), deadline: d(60), shoot_dates: [d(21), d(22), d(23)] });
  await advance(p10, "deal", { completeCurrent: 2 });
  const late = await setTask(p10, "Doel, doelgroep", { due_date: d(-3), assignee_id: ids.employee });
  await nextAction(p10, late, { next_action_assignee_id: ids.employee, next_action_date: d(-2) });

  // 11. Afgerond en 12. Verloren
  const p11 = await project({ name: "Jaarverslag video 2025", client_id: clients["Gemeente Rivierstad"], project_type: "Corporate", start_date: d(-200), deadline: d(-120) });
  await advance(p11, "afgerond");
  const p12 = await project({ name: "Sponsorvideo", client_id: clients["Sportclub Vooruit"], project_type: "Sponsor", start_date: d(-40) });
  must(await lars.from("projects").update({ phase: "verloren", health_note: "Budget niet rond" }).eq("id", p12), "verloren");

  // Realistischer beeld: oude, niet bewust ingestelde taken zijn al gedaan. Eén taak blijft bewust achterstallig.
  must(await lars.from("tasks").update({ status: "klaar" }).eq("status", "todo").lt("due_date", T).neq("id", late), "opschonen");

  // Financiën (alleen eigenaar). Bedragen in centen, exclusief btw.
  const fin = lars.schema("finance");
  must(await fin.from("project_finances").update({ quote_amount_cents: 1850000, quote_reference: "OFF-2026-014", quote_sent_on: d(-55) }).eq("project_id", p1), "fin");
  must(await fin.from("costs").insert([
    { project_id: p1, kind: "begroot", category: "freelancer", description: "Camera 2 dagen", amount_cents: 180000 },
    { project_id: p1, kind: "begroot", category: "huur", description: "Licht en audio", amount_cents: 60000 },
    { project_id: p1, kind: "werkelijk", category: "freelancer", description: "Camera 2 dagen", amount_cents: 190000 },
  ]), "kosten");
  const inv1 = must(await fin.from("invoices").insert({ project_id: p1, invoice_number: "2026-031", description: "Voorschot 50%", issued_on: d(-50), due_on: d(-36), amount_excl_cents: 925000, vat_cents: 194250 }).select("id").single(), "factuur");
  must(await fin.from("payments").insert({ invoice_id: inv1.id, received_on: d(-40), amount_cents: 1119250, reference: "Bank" }), "betaling");

  must(await fin.from("project_finances").update({ quote_amount_cents: 1200000, quote_reference: "OFF-2026-009" }).eq("project_id", p8), "fin");
  must(await fin.from("extra_work").insert({ project_id: p8, description: "Extra 9:16-versie", amount_cents: 75000, status: "goedgekeurd", approved_on: d(-10) }), "meerwerk");
  must(await fin.from("costs").insert([
    { project_id: p8, kind: "werkelijk", category: "freelancer", description: "Tweede camera", amount_cents: 95000 },
    { project_id: p8, kind: "werkelijk", category: "huur", description: "Gimbal en audio", amount_cents: 35000 },
  ]), "kosten");
  const inv8a = must(await fin.from("invoices").insert({ project_id: p8, invoice_number: "2026-040", description: "Termijn 1", issued_on: d(-45), due_on: d(-31), amount_excl_cents: 600000, vat_cents: 126000 }).select("id").single(), "factuur");
  must(await fin.from("payments").insert({ invoice_id: inv8a.id, received_on: d(-30), amount_cents: 726000 }), "betaling");
  const inv8b = must(await fin.from("invoices").insert({ project_id: p8, invoice_number: "2026-052", description: "Eindfactuur incl. meerwerk", issued_on: d(-20), due_on: d(-6), amount_excl_cents: 675000, vat_cents: 141750 }).select("id").single(), "factuur");
  must(await fin.from("payments").insert({ invoice_id: inv8b.id, received_on: d(-2), amount_cents: 300000, reference: "Deelbetaling" }), "deelbetaling");
  must(await fin.from("followups").insert({ project_id: p8, description: "Restant eindfactuur 2026-052 nabellen", due_on: d(1) }), "opvolging");

  const b2 = await lars.from("bookings").select("id").eq("project_id", p2).eq("freelancer_id", fJoris).single();
  must(await fin.from("booking_agreements").insert({ booking_id: b2.data!.id, rate_cents: 65000, rate_unit: "dag", agreed_total_cents: 130000 }), "tarief");
  must(await fin.from("project_finances").update({ quote_amount_cents: 2400000 }).eq("project_id", p2), "fin");

  // Klantpublicaties (expliciet gepubliceerd)
  const publish = async (projectId: string, content: Record<string, unknown>, draft: Record<string, unknown>) => {
    must(await lars.from("portal_drafts").upsert({ project_id: projectId, content: draft }), "concept");
    must(await lars.from("portal_snapshots").upsert({ project_id: projectId, content }), "publicatie");
  };
  await publish(
    p1,
    {
      project_name: "Wervingscampagne zorgpersoneel",
      client_name: "Gemeente Rivierstad",
      phase_label: "Review",
      goal: "Meer sollicitaties voor zorgfuncties in de regio.",
      scope: "Drie portretten, elk 60 sec + cutdown. Twee feedbackrondes per video.",
      next_step: "Feedback op 'Portret thuiszorg' versie 1",
      next_step_date: d(2),
      milestones: [{ title: "Oplevering alle video's", date: d(12) }],
      shoot_days: [],
      deliverables: [
        { name: "Portret verpleegkundige", planned_delivery_date: d(10), status_label: "In review", review_url: "https://vimeo.com/review/111111112", version_number: 2, final_links: [] },
        { name: "Portret thuiszorg", planned_delivery_date: d(10), status_label: "Wacht op jullie feedback", review_url: "https://vimeo.com/review/222222221", version_number: 1, final_links: [] },
        { name: "Portret helpende", planned_delivery_date: d(12), status_label: "Goedgekeurd", review_url: null, version_number: 1, final_links: [] },
      ],
    },
    { phase_label: "Review", goal: "Meer sollicitaties voor zorgfuncties in de regio.", scope: "Drie portretten, elk 60 sec + cutdown. Twee feedbackrondes per video.", next_step: "Feedback op 'Portret thuiszorg' versie 1", next_step_date: d(2), milestones: [{ title: "Oplevering alle video's", date: d(12) }], show_shoot_days: false, deliverable_ids: [d1a, d1b, d1c], show_review_links: true, show_final_links: true },
  );
  await publish(
    p2,
    {
      project_name: "Merkfilm vakmanschap",
      client_name: "Bakkerij Korrel",
      phase_label: "Voorbereiding opnames",
      goal: "Het ambacht achter het brood zichtbaar maken.",
      scope: "Merkfilm 90 sec + drie social cutdowns.",
      next_step: "Planning draaidagen bevestigen",
      next_step_date: d(1),
      milestones: [],
      shoot_days: sd2.map((s) => ({ date: s.shoot_date, start_time: null, location: "Bakkerij Korrel" })),
      deliverables: [],
    },
    { phase_label: "Voorbereiding opnames", goal: "Het ambacht achter het brood zichtbaar maken.", scope: "Merkfilm 90 sec + drie social cutdowns.", next_step: "Planning draaidagen bevestigen", next_step_date: d(1), milestones: [], show_shoot_days: true, deliverable_ids: [], show_review_links: false, show_final_links: false },
  );

  console.log("\nOntwikkelseed klaar (fictieve data). Testaccounts:");
  for (const u of Object.values(SEED_USERS)) console.log(`  ${u.role.padEnd(10)} ${u.email}`);
  console.log(`  wachtwoord: ${process.env.SEED_PASSWORD ? "(uit SEED_PASSWORD)" : password}`);
  console.log(`  week van ${thisMonday}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
