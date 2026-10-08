import { redirect } from "next/navigation";
import { requireSession, homeFor } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  if (s.role !== "owner" && s.role !== "employee") redirect(homeFor(s.role));
  const { count } = await s.supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  const nav = [
    { href: "/", label: "Dashboard" },
    { href: "/projecten", label: "Projecten" },
    { href: "/planning", label: "Planning" },
    { href: "/freelancers", label: "Freelancers" },
    ...(s.role === "owner" ? [{ href: "/financien", label: "Financiën" }] : []),
    { href: "/instellingen", label: "Instellingen" },
  ];
  return (
    <AppShell nav={nav} user={{ name: s.name, role: s.role }} unread={count ?? 0} showSearch showBell>
      {children}
    </AppShell>
  );
}
