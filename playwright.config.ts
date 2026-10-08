import { defineConfig, devices } from "@playwright/test";

/**
 * E2E-tests tegen een draaiende app + lokale Supabase met verse ontwikkelseed.
 * Start de app zelf (`npm run build && npm start`) of laat Playwright dat doen.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
    trace: "retain-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobiel", use: { ...devices["Pixel 7"] }, grep: /@mobiel/ },
  ],
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
