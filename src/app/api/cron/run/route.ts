import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runJobs } from "@/lib/jobs/runner";

/**
 * Scheduler-endpoint. Beveiligd met Authorization: Bearer <CRON_SECRET> (min. 32 tekens).
 * Zonder geldige configuratie altijd 404, zodat het endpoint niet openstaat.
 */
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < 32) return false;
  const given = Buffer.from((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function handle(req: NextRequest) {
  if (!authorized(req)) return new NextResponse("Not found", { status: 404 });
  const results = await runJobs(createAdminClient(), { worker: "cron" });
  return NextResponse.json(
    { processed: results.length, failed: results.filter((r) => !r.ok).length },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = handle;
export const POST = handle;
