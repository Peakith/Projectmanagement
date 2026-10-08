import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { fileResponse } from "@/lib/file-response";

/** Financiële documenten: alleen eigenaar (expliciete check + RLS op schema finance). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (s?.role !== "owner") return new NextResponse("Niet gevonden", { status: 404 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Niet gevonden", { status: 404 });
  const { data } = await s.supabase.schema("finance").from("documents").select("file_name, mime_type, kind, content").eq("id", id).maybeSingle();
  if (!data || data.kind !== "file") return new NextResponse("Niet gevonden", { status: 404 });
  return fileResponse(data.content as string, data.file_name!, data.mime_type);
}
