/**
 * Voert geplande jobs uit (signaalscan + wachtrij). Lokaal:
 *   npm run jobs:run            # één keer
 *   npm run jobs:run -- --loop  # elke 15 minuten, tot Ctrl+C
 * In productie roept een scheduler /api/cron/run aan (zie README).
 */
import { adminClient } from "./lib/script-env";
import { runJobs } from "../src/lib/jobs/runner";

const loop = process.argv.includes("--loop");
const admin = adminClient();

async function once() {
  const results = await runJobs(admin, { worker: `cli-${process.pid}` });
  const failed = results.filter((r) => !r.ok);
  console.log(`[${new Date().toISOString()}] ${results.length} job(s) verwerkt, ${failed.length} mislukt`);
  for (const f of failed) console.log(`  ✗ ${f.kind}: ${f.error}`);
}

await once();
if (loop) setInterval(() => once().catch((e) => console.error(e)), 15 * 60 * 1000);
