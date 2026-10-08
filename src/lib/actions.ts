import "server-only";
import { z } from "zod";
import type { ActionResult } from "./action-result";

export type { ActionResult };

type PgError = { code?: string; message?: string; details?: string } | null | undefined;

/** Zet databasefouten om in begrijpelijke Nederlandse meldingen zonder interne details te lekken. */
export function dbError(error: PgError, fallback = "Opslaan is niet gelukt. Probeer het opnieuw."): ActionResult {
  if (!error) return { ok: false, error: fallback };
  switch (error.code) {
    case "42501":
      return { ok: false, error: error.message && /[a-z]/.test(error.message) && !error.message.includes("policy") ? error.message : "Je hebt geen rechten voor deze actie." };
    case "23505":
      return { ok: false, error: "Dit bestaat al (dubbele waarde)." };
    case "23514":
      return { ok: false, error: "Een of meer velden zijn ongeldig (bijvoorbeeld een link die niet met https:// begint of een ontbrekende reden)." };
    case "23503":
      return { ok: false, error: "Dit item hangt samen met andere gegevens en kan niet worden gewijzigd of verwijderd." };
    case "P0001":
      return { ok: false, error: error.message ?? fallback };
    case "PGRST116":
      return { ok: false, error: "Niet gevonden of geen toegang." };
    default:
      if (error.message?.includes("row-level security")) return { ok: false, error: "Je hebt geen rechten voor deze actie." };
      return { ok: false, error: fallback };
  }
}

export function zodError(err: z.ZodError): ActionResult {
  const fieldErrors: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  const first = err.issues[0];
  return { ok: false, error: first ? `${first.path.join(".") || "Invoer"}: ${first.message}` : "Ongeldige invoer", fieldErrors };
}

/** Leest FormData als plat object; lege strings worden null. Herhaalde velden als array via `arrays`. */
export function formObject(fd: FormData, arrays: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(fd.keys())) {
    if (key.startsWith("$ACTION")) continue;
    if (arrays.includes(key)) {
      out[key] = fd.getAll(key).map(String).filter((v) => v !== "");
    } else {
      const v = fd.get(key);
      out[key] = typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v;
    }
  }
  for (const a of arrays) if (!(a in out)) out[a] = [];
  return out;
}

// Herbruikbare zod-velden
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ongeldige datum");
export const zTime = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Ongeldige tijd");
export const zUuid = z.uuid("Ongeldige verwijzing");
export const zText = (max = 2000) => z.string().max(max, `Maximaal ${max} tekens`);
export const zBool = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
export const zUrl = z
  .string()
  .max(2000)
  .refine((v) => {
    try {
      const u = new URL(v);
      return (u.protocol === "https:" || u.protocol === "http:") && !/\s/.test(v);
    } catch {
      return false;
    }
  }, "Gebruik een geldige link die begint met https://");
