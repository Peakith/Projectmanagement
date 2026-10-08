/**
 * Verwerkt de persistente jobtabel. Herhaalbaar: dubbele planning wordt via dedupe-sleutels
 * voorkomen, meldingen via unieke (user_id, dedupe_key). Mislukte jobs krijgen een retry met
 * exponentiële backoff en een geregistreerde foutmelding.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayISO } from "@/lib/domain/dates";
import { handleQuoteEvent } from "@/lib/integrations/quotes";

type Job = { id: string; kind: string; payload: Record<string, unknown>; attempts: number };
type Handler = (admin: SupabaseClient, payload: Record<string, unknown>) => Promise<unknown>;

export const handlers: Record<string, Handler> = {
  async signal_scan(admin, payload) {
    const { data, error } = await admin.rpc("run_signal_scan", { p_today: payload.today });
    if (error) throw new Error(error.message);
    return data;
  },
  async quote_event(admin, payload) {
    return handleQuoteEvent(admin, payload);
  },
};

/** Plant de periodieke signaalscan: maximaal één per uur (Amsterdamse tijd). */
export async function scheduleSignalScan(admin: SupabaseClient, now = new Date()) {
  const today = todayISO(now);
  const hour = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "2-digit", hour12: false }).format(now);
  const { error } = await admin.rpc("enqueue_job", {
    p_kind: "signal_scan",
    p_payload: { today },
    p_dedupe: `signal_scan:${today}:${hour}`,
  });
  if (error) throw new Error(error.message);
}

export async function runJobs(admin: SupabaseClient, opts: { worker?: string; now?: Date; limit?: number; schedule?: boolean } = {}) {
  const worker = opts.worker ?? `worker-${process.pid}`;
  if (opts.schedule !== false) await scheduleSignalScan(admin, opts.now);
  const { data, error } = await admin.rpc("claim_jobs", { p_worker: worker, p_limit: opts.limit ?? 20 });
  if (error) throw new Error(`Jobs ophalen mislukt: ${error.message}`);
  const results: { id: string; kind: string; ok: boolean; error?: string }[] = [];
  for (const job of (data ?? []) as Job[]) {
    try {
      const handler = handlers[job.kind];
      if (!handler) throw new Error(`Onbekend jobtype: ${job.kind}`);
      const result = await handler(admin, job.payload);
      await admin.rpc("complete_job", { p_id: job.id, p_result: (result ?? {}) as object });
      results.push({ id: job.id, kind: job.kind, ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await admin.rpc("fail_job", { p_id: job.id, p_error: message });
      results.push({ id: job.id, kind: job.kind, ok: false, error: message });
    }
  }
  return results;
}
