import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function CrewLayout({ children }: { children: React.ReactNode }) {
  const s = await requireRole("freelancer");
  return (
    <AppShell nav={[{ href: "/crew", label: "Mijn projecten" }]} user={{ name: s.name, role: s.role }} home="/crew">
      {children}
    </AppShell>
  );
}
