/**
 * Voorbereiding offerte-integratie. Het offerteprogramma is nog onbekend; dit is een
 * provider-onafhankelijk eventformaat. Verwerking is idempotent in de database:
 *  - uniek (source, event_id) voor events,
 *  - uniek (source, external_id) en uniek project_id voor offertes,
 *  - advisory lock per offerte tegen gelijktijdige events.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const quoteEventSchema = z.object({
  source: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  event_id: z.string().min(1).max(200),
  type: z.enum(["quote.created", "quote.accepted"]),
  external_id: z.string().min(1).max(200),
  data: z
    .object({
      title: z.string().max(200).optional(),
      client_name: z.string().max(200).optional(),
      amount_cents: z.number().int().nonnegative().optional(),
    })
    .default({}),
});
export type QuoteEvent = z.infer<typeof quoteEventSchema>;

export type QuoteResult = { status: string; project_id: string | null };

/** Verwerkt één event met een service-client (alleen server-side / jobs). */
export async function handleQuoteEvent(admin: SupabaseClient, input: unknown): Promise<QuoteResult> {
  const e = quoteEventSchema.parse(input);
  const { data, error } = await admin.rpc("process_quote_event", {
    p_source: e.source,
    p_event_id: e.event_id,
    p_type: e.type,
    p_external_id: e.external_id,
    p_data: e.data,
  });
  if (error) throw new Error(`Offerte-event mislukt: ${error.message}`);
  return data as QuoteResult;
}

export const SIGNATURE_TOLERANCE_SECONDS = 300;

/** Signatuur: hex(HMAC-SHA256(secret, `${timestamp}.${rawBody}`)), header 't=<unix>,v1=<hex>'. */
export function signPayload(rawBody: string, secret: string, timestamp: number): string {
  const sig = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v1=${sig}`;
}

export function verifySignature(rawBody: string, header: string | null, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (!header || !secret || secret.length < 32) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2) as [string, string]));
  const ts = Number(parts.t);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(signPayload(rawBody, secret, ts).split("v1=")[1], "hex");
  const given = Buffer.from(parts.v1 ?? "", "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
