"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { dbError, zodError, zUrl, type ActionResult } from "@/lib/actions";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const visibility = z.enum(["internal", "crew"]);

export async function addDocument(projectId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const kind = fd.get("kind") === "file" ? "file" : "link";
  const base = z.object({ title: z.string().trim().min(1, "Titel is verplicht").max(200), visibility }).safeParse({ title: fd.get("title"), visibility: fd.get("visibility") ?? "internal" });
  if (!base.success) return zodError(base.error);
  if (kind === "link") {
    const url = zUrl.safeParse(String(fd.get("url") ?? "").trim());
    if (!url.success) return zodError(url.error);
    const { error } = await s.supabase.from("documents").insert({ project_id: projectId, kind, url: url.data, ...base.data, created_by: s.userId });
    if (error) return dbError(error);
  } else {
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Kies een bestand" };
    if (file.size > MAX_FILE_BYTES) return { ok: false, error: "Bestand is groter dan 10 MB. Deel grote bestanden via een link." };
    const name = file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 150) || "bestand";
    const { data, error } = await s.supabase
      .from("documents")
      .insert({ project_id: projectId, kind, file_name: name, mime_type: file.type.slice(0, 100) || "application/octet-stream", size_bytes: file.size, ...base.data, created_by: s.userId })
      .select("id")
      .single();
    if (error) return dbError(error);
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: e2 } = await s.supabase.from("document_files").insert({ document_id: data.id, content: "\\x" + bytes.toString("hex") });
    if (e2) {
      await s.supabase.from("documents").delete().eq("id", data.id);
      return dbError(e2);
    }
  }
  revalidatePath(`/projecten/${projectId}/documenten`);
  return { ok: true, message: kind === "file" ? "Bestand geüpload" : "Link toegevoegd" };
}

export async function setDocumentVisibility(projectId: string, docId: string, v: "internal" | "crew"): Promise<ActionResult> {
  const s = await requireStaff();
  const { error } = await s.supabase.from("documents").update({ visibility: visibility.parse(v) }).eq("id", docId).eq("project_id", projectId);
  if (error) return dbError(error);
  revalidatePath(`/projecten/${projectId}/documenten`);
  return { ok: true, message: v === "crew" ? "Gedeeld met crew" : "Alleen intern" };
}

export async function deleteDocument(projectId: string, docId: string): Promise<ActionResult> {
  const s = await requireStaff();
  const { error } = await s.supabase.from("documents").delete().eq("id", docId).eq("project_id", projectId);
  if (error) return dbError(error);
  revalidatePath(`/projecten/${projectId}/documenten`);
  return { ok: true, message: "Verwijderd" };
}
