import { getProject } from "@/lib/data/project";
import { allProfiles } from "@/lib/data/overview";
import { formatDateTime } from "@/lib/domain/dates";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";

export default async function ActivityPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ meer?: string }> }) {
  const { id } = await params;
  const { meer } = await searchParams;
  const { s } = await getProject(id);
  const limit = meer ? 500 : 100;
  // RLS: medewerkers zien alleen 'staff'-activiteit; financiële gebeurtenissen alleen de eigenaar.
  const [{ data }, names] = await Promise.all([
    s.supabase.from("activities").select("id, actor_id, summary, visibility, created_at").eq("project_id", id).order("created_at", { ascending: false }).limit(limit),
    allProfiles(s.supabase),
  ]);
  return (
    <Card>
      {(data ?? []).length === 0 ? (
        <div className="p-4">
          <EmptyState title="Nog geen activiteit" />
        </div>
      ) : (
        <ol className="divide-y divide-zinc-100">
          {(data ?? []).map((a) => (
            <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2 text-sm">
              <span className="w-32 shrink-0 text-xs text-zinc-500">{formatDateTime(a.created_at)}</span>
              <span className="flex-1">{a.summary}</span>
              {a.visibility === "owner" && <Badge>Alleen eigenaar</Badge>}
              <span className="text-xs text-zinc-600">{a.actor_id ? (names.get(a.actor_id) ?? "Onbekend") : "Systeem"}</span>
            </li>
          ))}
        </ol>
      )}
      {(data ?? []).length === limit && !meer && (
        <a href="?meer=1" className="block px-4 py-3 text-sm font-semibold underline">
          Meer tonen
        </a>
      )}
    </Card>
  );
}
