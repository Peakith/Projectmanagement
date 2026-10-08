import { expect, test, type Page } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
const PW = process.env.SEED_PASSWORD!;

async function login(page: Page, email = "lars@studiobrutaal.test") {
  await page.goto("/login");
  await page.getByLabel("E-mailadres").fill(email);
  await page.getByLabel("Wachtwoord").fill(PW);
  await page.getByRole("button", { name: "Inloggen" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

async function newProject(page: Page, name: string) {
  await page.goto("/projecten/nieuw");
  await page.getByLabel("Projectnaam").fill(name);
  await page.getByLabel("Projectdeadline").fill("2026-12-15");
  await page.getByLabel("Draaidag 1").fill("2026-11-20");
  await page.getByRole("button", { name: "Project aanmaken" }).click();
  await page.waitForURL(/\/projecten\/[0-9a-f-]{36}\?nieuw=1/);
  return page.url().split("/projecten/")[1].split("?")[0];
}

const toast = (page: Page, text: string | RegExp) => expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();

test.describe.configure({ mode: "serial" });

test("formulieren van taken, productie en documenten werken", async ({ page }) => {
  await login(page);
  const id = await newProject(page, `Formtest ${Date.now()}`);

  // Taakdetail opslaan (zonder conditionele velden) + checklist + opmerking
  await page.goto(`/projecten/${id}/taken`);
  await page.getByRole("link", { name: "Kennismaking / briefing plannen" }).click();
  await page.getByLabel("Nieuw checklistitem").fill("Agenda sturen");
  await page.getByRole("button", { name: "Toevoegen", exact: true }).click();
  await page.getByLabel("Opvolgdatum").fill("2026-10-20");
  await page.getByRole("button", { name: "Opslaan", exact: true }).click();
  await toast(page, "Taak opgeslagen");
  await page.getByLabel("Status", { exact: true }).selectOption("geblokkeerd");
  await page.getByLabel("Reden voor blokkade").fill("Wacht op agenda klant");
  await page.getByRole("button", { name: "Opslaan", exact: true }).click();
  await toast(page, "Taak opgeslagen");
  await page.getByLabel("Nieuwe opmerking").fill("Klant belt terug");
  await page.getByRole("button", { name: "Plaatsen" }).click();
  await toast(page, "Opmerking geplaatst");
  await page.reload();
  await expect(page.getByText("Agenda sturen")).toBeVisible();
  await expect(page.getByText("Klant belt terug")).toBeVisible();

  // Nieuwe taak + fase n.v.t.
  await page.goto(`/projecten/${id}/taken`);
  await page.locator("#nt-title").fill("Extra taak E2E");
  await page.getByRole("button", { name: "Toevoegen", exact: true }).click();
  await toast(page, "Taak toegevoegd");

  // Draaidag toevoegen, bewerken (verplaatsen) en planningsvoorstel bevestigen
  await page.goto(`/projecten/${id}/productie`);
  await page.locator("#nsd-date").fill("2026-11-21");
  await page.locator("#nsd-loc").fill("Studio");
  await page.getByRole("button", { name: "Toevoegen", exact: true }).click();
  await toast(page, "Draaidag toegevoegd");
  await page.getByText("Draaidag bewerken").first().click();
  await page.locator("input[name=shoot_date]").first().fill("2026-11-19");
  await page.locator("input[name=callsheet_url]").first().fill("https://docs.example.com/cs");
  await page.getByRole("button", { name: "Opslaan", exact: true }).first().click();
  await toast(page, /Draaidag verplaatst/);
  await page.goto(`/projecten/${id}`);
  await expect(page.getByRole("heading", { name: "Planningsvoorstel" })).toBeVisible();
  await page.getByRole("button", { name: "Geselecteerde datums bijwerken" }).click();
  await toast(page, /taakdatum/);

  // Boeking van een freelancer zonder account
  await page.goto(`/projecten/${id}/productie`);
  await page.locator("#b-fl-new").selectOption({ label: "Mila Jansen (Montage, Kleur)" });
  await page.locator("#b-role-new").fill("Montage");
  await page.getByRole("button", { name: "Boeken" }).click();
  await toast(page, "Boeking toegevoegd");
  await expect(page.getByText("Geen account").first()).toBeVisible();

  // Document: link en bestand (beveiligde download)
  await page.goto(`/projecten/${id}/documenten`);
  await page.locator("#doc-title").fill("Moodboard");
  await page.locator("#doc-url").fill("https://docs.example.com/moodboard");
  await page.getByRole("button", { name: "Toevoegen" }).click();
  await toast(page, "Link toegevoegd");
  await page.locator("#doc-kind").selectOption("file");
  await page.locator("#doc-title").fill("Script v1");
  await page.locator("#doc-file").setInputFiles({ name: "script.txt", mimeType: "text/plain", buffer: Buffer.from("INT. BAKKERIJ - DAG") });
  await page.getByRole("button", { name: "Toevoegen" }).click();
  await toast(page, "Bestand geüpload");
  const href = await page.getByRole("link", { name: "Script v1" }).getAttribute("href");
  const dl = await page.request.get(href!);
  expect(dl.status()).toBe(200);
  expect(await dl.text()).toBe("INT. BAKKERIJ - DAG");
  expect(dl.headers()["cache-control"]).toContain("no-store");

  // Een klant kan hetzelfde document niet downloaden
  const other = await page.context().browser()!.newContext();
  const cp = await other.newPage();
  await login(cp, "klant-a@rivierstad.test");
  expect((await cp.request.get(href!)).status()).toBe(404);
  await other.close();
});

test("deliverables: versie, rondes, extra ronde door eigenaar en akkoord", async ({ page }) => {
  await login(page);
  const id = await newProject(page, `Videotest ${Date.now()}`);
  await page.goto(`/projecten/${id}/deliverables`);
  await page.locator("#d-n-new").fill("Hoofdfilm");
  await page.getByRole("button", { name: "Video toevoegen" }).click();
  await toast(page, "Video toegevoegd");

  const openVersion = async (n: number) => {
    const det = page.locator("details", { has: page.getByText("Nieuwe versie vastleggen") }).first();
    if ((await det.getAttribute("open")) === null) await page.getByText("Nieuwe versie vastleggen").click();
    await page.locator("input[name=review_url]").fill(`https://vimeo.com/${n}`);
    await page.getByRole("button", { name: "Versie opslaan" }).click();
    await toast(page, `Versie ${n} vastgelegd`);
  };
  const round = async (label: RegExp, extra = false) => {
    await page.getByText(label).click();
    if (extra) {
      await page.getByLabel("Reden extra werk").fill("Klant wil andere muziek");
      await page.getByLabel("Bedrag meerwerk (optioneel, excl. btw)").fill("350");
      await page.getByLabel("Ik keur dit extra werk goed").check();
    }
    await page.getByRole("button", { name: "Ronde openen" }).click();
    await toast(page, /ronde \d+ geopend/i);
  };
  const processRound = async (n: number) => {
    const li = page.locator("li", { has: page.getByText(`Ronde ${n}`, { exact: true }) }).first();
    await li.getByText("Ronde bijwerken").click();
    await li.locator("select[name=status]").selectOption("verwerkt");
    await li.getByRole("button", { name: "Opslaan", exact: true }).click();
    await toast(page, "Feedbackronde bijgewerkt");
  };

  await openVersion(1);
  await round(/^Ronde 1 openen$/);
  await processRound(1);
  await openVersion(2);
  await round(/^Ronde 2 openen$/);
  await processRound(2);
  await expect(page.getByText("Inbegrepen feedbackrondes zijn gebruikt")).toBeVisible();
  await round(/Extra ronde 3 openen/, true);
  await expect(page.getByText("Buiten scope — extra")).toBeVisible();
  await page.getByRole("button", { name: "Akkoord vastleggen" }).click();
  await toast(page, "Akkoord vastgelegd");
  await expect(page.getByText(/Akkoord op v2/).first()).toBeVisible();

  // Meerwerk staat (alleen) in het financiële deel
  await page.goto(`/projecten/${id}/financien`);
  await expect(page.getByText("Extra feedbackronde 3: Klant wil andere muziek")).toBeVisible();
});

test("financiën: meerdere facturen en een deelbetaling", async ({ page }) => {
  await login(page);
  const id = await newProject(page, `Fintest ${Date.now()}`);
  await page.goto(`/projecten/${id}/financien`);
  await page.locator("#q-amount").fill("10.000,00");
  await page.getByRole("button", { name: "Opslaan", exact: true }).first().click();
  await toast(page, "Offertegegevens opgeslagen");
  const n = String(Date.now()).slice(-6);
  for (const nr of [`E2E-${n}-1`, `E2E-${n}-2`]) {
    await page.locator("#i-n").fill(nr);
    await page.locator("#i-due").fill("2026-12-01");
    await page.locator("#i-a").fill("5000");
    await page.getByRole("button", { name: "Factuur toevoegen" }).click();
    await toast(page, "Factuur toegevoegd");
  }
  const payForm = page.locator("form", { has: page.getByRole("button", { name: "Betaling registreren" }) }).first();
  await payForm.getByLabel("Bedrag (incl. btw)").fill("1000");
  await payForm.getByRole("button", { name: "Betaling registreren" }).click();
  await toast(page, "Betaling geregistreerd");
  await expect(page.getByText("Deels betaald").first()).toBeVisible();
  await expect(page.getByText("Openstaand (incl. btw)").locator("..").getByText(/11\.100,00/)).toBeVisible();
});

test("eigenaar nodigt een medewerker uit; uitnodigingslink werkt", async ({ page, browser }) => {
  await login(page);
  await page.goto("/instellingen/gebruikers");
  const email = `nieuw-${Date.now()}@studiobrutaal.test`;
  await page.locator("#iv-name").fill("Nieuwe collega");
  await page.locator("#iv-email").fill(email);
  await page.getByRole("button", { name: "Account aanmaken" }).click();
  const link = await page.getByLabel("Uitnodigingslink").inputValue();
  expect(link).toContain("/auth/callback?token_hash=");

  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(link);
  await p.waitForURL(/\/auth\/wachtwoord/);
  await p.getByLabel("Nieuw wachtwoord").fill("EenSterkWachtwoord!1");
  await p.getByLabel("Herhaal wachtwoord").fill("EenSterkWachtwoord!1");
  await p.getByRole("button", { name: "Opslaan en doorgaan" }).click();
  await p.waitForURL((u) => u.pathname === "/");
  await expect(p.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(p.getByRole("link", { name: "Financiën" })).toHaveCount(0);
  await ctx.close();
});

test("template: nieuwe versie, taak toevoegen en publiceren", async ({ page }) => {
  await login(page);
  await page.goto("/instellingen/templates");
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Nieuwe versie maken" }).first().click();
  await page.waitForURL(/\/instellingen\/templates\/[0-9a-f-]{36}/);
  await page.locator("#tt-t-new").fill("Drone-vergunning checken");
  await page.locator("#tt-p-new").selectOption("preproductie");
  await page.getByRole("button", { name: "Toevoegen", exact: true }).click();
  await toast(page, "Taak toegevoegd");
  await page.getByRole("button", { name: "Publiceren" }).click();
  await toast(page, /Versie gepubliceerd/);
  await expect(page.getByText("Gepubliceerd").first()).toBeVisible();
});
