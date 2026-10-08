import { expect, test, type Page } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
const PW = process.env.SEED_PASSWORD!;

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mailadres").fill(email);
  await page.getByLabel("Wachtwoord").fill(PW);
  await page.getByRole("button", { name: "Inloggen" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("eigenaar maakt project vanuit template, kiest volgende actie en ziet het na herladen terug", async ({ page }) => {
  await login(page, "lars@studiobrutaal.test");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  const name = `E2E film ${Date.now()}`;
  await page.getByRole("link", { name: "Nieuw project" }).click();
  await page.getByLabel("Projectnaam").fill(name);
  await page.getByRole("button", { name: "+ Nieuwe klant" }).click();
  await page.getByLabel("Nieuwe klant").fill("E2E Klant");
  await page.getByLabel("Projectdeadline").fill("2026-12-15");
  await page.getByLabel("Draaidag 1").fill("2026-11-20");
  await page.getByRole("button", { name: "Project aanmaken" }).click();
  await expect(page.getByText("Project aangemaakt", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // Volgende actie kiezen uit een taak
  await page.getByLabel("Taak", { exact: true }).selectOption({ label: "Kennismaking / briefing plannen" });
  await page.getByRole("button", { name: "Volgende actie opslaan" }).click();
  await expect(page.getByRole("link", { name: "Kennismaking / briefing plannen" })).toBeVisible();

  // Taken per fase, inclusief taken per draaidag
  await page.getByRole("link", { name: "Taken" }).click();
  await page.getByRole("link", { name: "Alle taken" }).click();
  await expect(page.getByRole("link", { name: "Opnames uitvoeren — draaidag 20-11" })).toBeVisible();

  // Wachtstatus op een taak zetten
  const status = page.getByLabel("Status van Aanvraag en klantgegevens vastleggen");
  await status.selectOption("wacht_klant");
  await expect(page.getByText("Status bijgewerkt").first()).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Status van Aanvraag en klantgegevens vastleggen")).toHaveValue("wacht_klant");
  await expect(page.getByText(/wacht sinds 0 werkdagen/).first()).toBeVisible();

  // Dashboard telt het project
  await page.getByRole("link", { name: "Studio Brutaal — naar het dashboard" }).first().click();
  await expect(page.getByRole("link", { name }).first()).toBeVisible();
  await expect(page.getByText("Wachten op klant").first()).toBeVisible();
});

test("eigenaar publiceert klantinformatie expliciet; klant ziet alleen eigen project", async ({ browser }) => {
  const owner = await browser.newPage();
  await login(owner, "lars@studiobrutaal.test");
  await owner.goto("/projecten");
  await owner.getByRole("link", { name: "Wervingscampagne zorgpersoneel" }).click();
  await owner.getByRole("link", { name: "Klantportaal" }).click();
  const step = `Feedback graag vóór vrijdag ${Date.now()}`;
  await owner.getByLabel("Volgende stap voor de klant").fill(step);
  await owner.getByRole("button", { name: "Concept opslaan" }).click();
  await expect(owner.getByText("Concept opgeslagen").first()).toBeVisible();

  // Nog niet gepubliceerd: klant ziet de nieuwe stap niet
  const client = await browser.newPage();
  await login(client, "klant-a@rivierstad.test");
  await client.getByRole("link", { name: /Wervingscampagne/ }).click();
  await expect(client.getByText(step)).toHaveCount(0);

  owner.once("dialog", (d) => d.accept());
  await owner.getByRole("button", { name: "Opnieuw publiceren" }).click();
  await expect(owner.getByText("Gepubliceerd voor de klant").first()).toBeVisible();

  await client.reload();
  await expect(client.getByText(step)).toBeVisible();
  await expect(client.getByText("Interne")).toHaveCount(0);

  // Gewijzigde project-ID van klant B geeft geen toegang
  await owner.goto("/projecten");
  await owner.getByRole("link", { name: "Merkfilm vakmanschap" }).click();
  await owner.waitForURL(/\/projecten\/[0-9a-f-]{36}/);
  const otherId = owner.url().split("/projecten/")[1].split(/[/?]/)[0];
  const res = await client.goto(`/portaal/${otherId}`);
  expect(res?.status()).toBe(404);
});

test("medewerker heeft geen toegang tot financiën", async ({ page }) => {
  await login(page, "stagiaire@studiobrutaal.test");
  await expect(page.getByRole("link", { name: "Financiën" })).toHaveCount(0);
  await page.goto("/financien");
  await expect(page).toHaveURL(/geen-toegang/);
  const res = await page.request.get("/api/export/financien");
  expect(res.status()).toBe(404);
  const body = await (await page.request.get("/api/export/projecten")).text();
  expect(body).not.toMatch(/€|factuur|bedrag|betaal/i);
  expect(body).toContain("Wervingscampagne zorgpersoneel");
});

test("freelancer werkt een gedeelde taak bij en ziet geen andere projecten @mobiel", async ({ page }) => {
  await login(page, "joris@freelance.test");
  await expect(page).toHaveURL(/\/crew$/);
  await page.getByRole("link", { name: /Merkfilm vakmanschap/ }).click();
  await expect(page.getByText("Interne productienotities")).toHaveCount(0);
  const card = page.locator("section", { has: page.getByRole("heading", { name: /Apparatuur ophalen/ }) }).last();
  await card.getByLabel("Status").selectOption("klaar");
  await card.getByRole("button", { name: "Opslaan" }).click();
  await expect(page.getByText("Bijgewerkt").first()).toBeVisible();
  await page.reload();
  await expect(page.locator("section", { has: page.getByRole("heading", { name: /Apparatuur ophalen/ }) }).last().getByText("Klaar").first()).toBeVisible();
  await page.goto("/projecten");
  await expect(page).toHaveURL(/\/crew$/);
});
