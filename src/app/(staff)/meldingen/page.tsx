import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { formatDateTime } from "@/lib/domain/dates";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { ActionButton } from "@/components/action-button";
import { markRead } from "./actions";

export const metadata: Metadata = { title: "Meldingen" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ alle?: string }> }) {
  const s = await requireStaff();
  const { alle } = await searchParams;
  let q = s.supabase.from("notifications").select("id, title, body, link, created_at, read_at").order("created_at", { ascending: false }).limit(200);
  if (!alle) q = q.is("read_at", null);
  const { data } = await q;
  return (
    <>
      <PageHeader
        title="Meldingen"
        description="In-app meldingen van de automatische signaleringen. Er worden geen externe berichten verstuurd."
        actions={
          <>
            <Link href={alle ? "/meldingen" : "/meldingen?alle=1"} className="self-center text-sm font-semibold underline">
              {alle ? "Alleen ongelezen" : "Ook gelezen tonen"}
            </Link>
            {!alle && (data ?? []).length > 0 && (
              <ActionButton variant="outline" action={markRead.bind(null, undefined)}>
                Alles gelezen
              </ActionButton>
            )}
          </>
        }
      />
      <Card>
        {(data ?? []).length === 0 ? (
          <div className="p-4">
            <EmptyState title={alle ? "Geen meldingen" : "Geen ongelezen meldingen"} />
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {(data ?? []).map((n) => (
              <li key={n.id} className={`flex flex-wrap items-start justify-between gap-2 px-4 py-3 ${n.read_at ? "opacity-60" : ""}`}>
                <div>
                  {n.link ? (
                    <Link href={n.link} className="font-semibold hover:underline">
                      {n.title}
                    </Link>
                  ) : (
                    <p className="font-semibold">{n.title}</p>
                  )}
                  <p className="text-sm text-zinc-600">{n.body}</p>
                  <p className="text-xs text-zinc-500">{formatDateTime(n.created_at)}</p>
                </div>
                {!n.read_at && (
                  <ActionButton size="sm" variant="ghost" action={markRead.bind(null, n.id)}>
                    Gelezen
                  </ActionButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
