import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { fileResponse } from "@/lib/file-response";

/** Geautoriseerde download: RLS bepaalt of de ingelogde gebruiker dit document mag zien. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (!s?.role) return new NextResponse("Niet ingelogd", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Niet gevonden", { status: 404 });
  const { data: doc } = await s.supabase.from("documents").select("file_name, mime_type, kind").eq("id", id).maybeSingle();
  const { data: file } = await s.supabase.from("document_files").select("content").eq("document_id", id).maybeSingle();
  if (!doc || doc.kind !== "file" || !file) return new NextResponse("Niet gevonden", { status: 404 });
  return fileResponse(file.content as string, doc.file_name!, doc.mime_type);
}
