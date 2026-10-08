import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import type { PortalSnapshot } from "@/lib/domain/portal";
import { PortalView } from "@/components/portal-view";

export default async function PortalProject({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const s = await requireRole("client");
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) notFound();
  // Een gedeelde of gewijzigde URL geeft geen toegang: RLS controleert actieve portaaltoegang.
  const { data } = await s.supabase.from("portal_snapshots").select("content, published_at").eq("project_id", projectId).maybeSingle();
  if (!data) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/portaal" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-ink">
        <ChevronLeft className="size-4" aria-hidden /> Jouw projecten
      </Link>
      <PortalView s={data.content as PortalSnapshot} publishedAt={data.published_at} />
    </div>
  );
}
