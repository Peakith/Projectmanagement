"use server";
/**
 * Financiële acties: uitsluitend eigenaar (server-side gecontroleerd) én afgedwongen
 * door RLS op schema finance.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { dbError, formObject, zDate, zodError, zUrl, zUuid, type ActionResult } from "@/lib/actions";
import { parseEuroToCents } from "@/lib/domain/money";
import { vatCents } from "@/lib/domain/finance";
import { COST_CATEGORIES } from "@/lib/domain/labels";

const rp = (id: string) => {
  revalidatePath(`/projecten/${id}/financien`);
  revalidatePath("/financien");
};
const euro = (label: string, optional = false) =>
  z
    .string()
    .nullable()
    .transform((v, ctx) => {
      if (!v) {
        if (optional) return null;
        ctx.addIssue({ code: "custom", message: `${label} is verplicht` });
        return z.NEVER;
      }
      const c = parseEuroToCents(v);
      if (c === null || c < 0) {
        ctx.addIssue({ code: "custom", message: `${label}: ongeldig bedrag` });
        return z.NEVER;
      }
      return c;
    });

async function fin() {
  const s = await requireOwner();
  return { s, f: s.supabase.schema("finance") };
}

export async function updateQuote(projectId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { f } = await fin();
  const v = z
    .object({
      quote_amount: euro("Offertebedrag", true),
      quote_reference: z.string().max(100).nullable().transform((x) => x ?? ""),
      quote_sent_on: zDate.nullable(),
      vat_rate_percent: z.coerce.number().min(0).max(100),
      payment_terms: z.string().max(500).nullable().transform((x) => x ?? ""),
      notes: z.string().max(3000).nullable().transform((x) => x ?? ""),
    })
    .safeParse(formObject(fd));
  if (!v.success) return zodError(v.error);
  const { quote_amount, ...rest } = v.data;
  const { error } = await f.from("project_finances").upsert({ project_id: projectId, quote_amount_cents: quote_amount, ...rest, updated_at: new Date().toISOString() });
  if (error) return dbError(error);
  rp(projectId);
  return { ok: true, message: "Offertegegevens opgeslagen" };
}

export async function addExtraWork(projectId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { f } = await fin();
  const v = z
    .object({ description: z.string().trim().min(1, "Omschrijving is verplicht").max(500), amount: euro("Bedrag"), status: z.enum(["voorgesteld", "goedgekeurd", "afgewezen"]), approved_on: zDate.nullable() })
    .safeParse(formObject(fd));
  if (!v.success) return zodError(v.error);
  const approved_on = v.data.status === "goedgekeurd" ? (v.data.approved_on ?? new Date().toISOString().slice(0, 10)) : v.data.approved_on;
  const { error } = await f.from("extra_work").insert({ project_id: projectId, description: v.data.description, amount_cents: v.data.amount, status: v.data.status, approved_on });
  if (error) return dbError(error);
  rp(projectId);
  return { ok: true, message: "Meerwerk vastgelegd" };
}

export async function setExtraStatus(projectId: string, id: string, status: "goedgekeurd" | "afgewezen" | "voorgesteld"): Promise<ActionResult> {
  const { f } = await fin();
  const { error } = await f
    .from("extra_work")
    .update({ status, approved_on: status === "goedgekeurd" ? new Date().toISOString().slice(0, 10) : null })
    .eq("id", id)
    .eq("project_id", projectId);
  if (error) return dbError(error);
  rp(projectId);
  return { ok: true, message: "Meerwerk bijgewerkt" };
}

export async function addCost(projectId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { f } = await fin();
  const v = z
    .object({
      kind: z.enum(["begroot", "werkelijk"]),
      category: z.enum(COST_CATEGORIES),
      description: z.string().trim().min(1, "Omschrijving is verplicht").max(500),
      supplier: z.string().max(200).nullable().transform((x) => x ?? ""),
      amount: euro("Bedrag"),
      incurred_on: zDate.nullable(),
      booking_id: zUuid.nullable(),
    })
    .safeParse(formObject(fd));
  if (!v.success) return zodError(v.error);
  const { amount, ...rest } = v.data;
  const { error } = await f.from("costs").insert({ project_id: projectId, amount_cents: amount, ...rest });
  if (error) return dbError(error);
  rp(projectId);
  return { ok: true, message: "Kostenpost toegevoegd" };
}

export async function deleteFinanceRow(projectId: string, table: "costs" | "extra_work" | "invoices" | "payments" | "followups" | "documents", id: string): Promise<ActionResult> {
  const { f } = await fin();
  const t = z.enum(["costs", "extra_work", "invoices", "payments", "followups", "documents"]).parse(table);
  const { error } = await f.from(t).delete().eq("id", id);
  if (error) return dbError(error);
  rp(projectId);
  return { ok: true, message: "Verwijderd" };
}

export async function setBookingAgreement(projectId: string, bookingId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { f } = await fin();
  const v = z
    .object({ rate: euro("Tarief", true), rate_unit: z.enum(["dag", "halve_dag", "uur", "project"]), agreed_total: euro("Afgesproken totaal", true), notes: z.string().max(1000).nullable().transform((x) => x ?? "") })
    .safeParse(formObject(fd));
  if (!v.success) return zodError(v.error);
  const { error } = await f
    .from("booking_agreements")
    .upsert({ booking_id: bookingId, rate_cents: v.data.rate, rate_unit: v.data.rate_unit, agreed_total_cents: v.data.agreed_total, notes: v.data.notes, updated_at: new Date().toISOString() });
  if (error) return dbError(error);
  rp(projectId);
  return { ok: true, message: "Tariefafspraak opgeslagen" };
}

export async function addInvoice(projectId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { f } = await fin();
  const v = z
    .object({
      invoice_number: z.string().trim().min(1, "Factuurnummer is verplicht").max(60),
      description: z.string().max(500).nullable().transform((x) => x ?? ""),
      issued_on: zDate,
      due_on: zDate,
      amount_excl: euro("Bedrag excl. btw"),
      vat: euro("Btw", true),
      status: z.enum(["concept", "verstuurd", "gecrediteerd"]),
    })
    .refine((x) => x.due_on >= x.issued_on, { message: "Vervaldatum ligt vóór factuurdatum", path: ["due_on"] })
    .safeParse(formObject(fd));
  if (!v.success) return zodError(v.error);
  const { data: pf } = await f.from("project_finances").select("vat_rate_percent").eq("project_id", projectId).maybeSingle();
  const vat = v.data.vat ?? vatCents(v.data.amount_excl as number, Number(pf?.vat_rate_percent ?? 21));
  const { error } = await f.from("invoices").insert({
    project_id: projectId,
    invoice_number: v.data.invoice_number,
    description: v.data.description,
    issued_on: v.data.issued_on,
    due_on: v.data.due_on,
    amount_excl_cents: v.data.amount_excl,
    vat_cents: vat,
    status: v.data.status,
  });
  if (error) return error.code === "23505" ? { ok: false, error: "Dit factuurnummer bestaat al." } : dbError(error);
  rp(projectId);
  return { ok: true, message: "Factuur toegevoegd" };
}

export async function setInvoiceStatus(projectId: string, id: string, status: "concept" | "verstuurd" | "gecrediteerd"): Promise<ActionResult> {
  const { f } = await fin();
  const { error } = await f.from("invoices").update({ status }).eq("id", id).eq("project_id", projectId);
  if (error) return dbError(error);
  rp(projectId);
  return { ok: true, message: "Factuurstatus bijgewerkt" };
}

export async function addPayment(projectId: string, invoiceId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { f } = await fin();
  const v = z.object({ received_on: zDate, amount: euro("Bedrag"), reference: z.string().max(200).nullable().transform((x) => x ?? "") }).safeParse(formObject(fd));
  if (!v.success) return zodError(v.error);
  if (!v.data.amount || v.data.amount <= 0) return { ok: false, error: "Bedrag moet groter dan nul zijn" };
  const { error } = await f.from("payments").insert({ invoice_id: invoiceId, received_on: v.data.received_on, amount_cents: v.data.amount, reference: v.data.reference });
  if (error) return error.code === "P0001" ? { ok: false, error: "Deze betaling is hoger dan het openstaande bedrag van de factuur." } : dbError(error);
  rp(projectId);
  return { ok: true, message: "Betaling geregistreerd" };
}

export async function addFollowup(projectId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { f } = await fin();
  const v = z.object({ description: z.string().trim().min(1, "Omschrijving is verplicht").max(500), due_on: zDate.nullable() }).safeParse(formObject(fd));
  if (!v.success) return zodError(v.error);
  const { error } = await f.from("followups").insert({ project_id: projectId, ...v.data });
  if (error) return dbError(error);
  rp(projectId);
  return { ok: true, message: "Opvolging toegevoegd" };
}

export async function completeFollowup(projectId: string, id: string): Promise<ActionResult> {
  const { f } = await fin();
  const { error } = await f.from("followups").update({ done_at: new Date().toISOString() }).eq("id", id);
  if (error) return dbError(error);
  rp(projectId);
  return { ok: true, message: "Afgehandeld" };
}

export async function addFinanceDocument(projectId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { f } = await fin();
  const title = z.string().trim().min(1, "Titel is verplicht").max(200).safeParse(fd.get("title"));
  if (!title.success) return zodError(title.error);
  const file = fd.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > 10 * 1024 * 1024) return { ok: false, error: "Bestand is groter dan 10 MB" };
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error } = await f.from("documents").insert({
      project_id: projectId,
      title: title.data,
      kind: "file",
      file_name: file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 150),
      mime_type: file.type.slice(0, 100) || "application/octet-stream",
      size_bytes: file.size,
      content: "\\x" + bytes.toString("hex"),
    });
    if (error) return dbError(error);
  } else {
    const url = zUrl.safeParse(String(fd.get("url") ?? "").trim());
    if (!url.success) return { ok: false, error: "Kies een bestand of vul een geldige link in" };
    const { error } = await f.from("documents").insert({ project_id: projectId, title: title.data, kind: "link", url: url.data });
    if (error) return dbError(error);
  }
  rp(projectId);
  return { ok: true, message: "Financieel document toegevoegd" };
}
