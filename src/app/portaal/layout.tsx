import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const s = await requireRole("client");
  return (
    <AppShell nav={[{ href: "/portaal", label: "Mijn projecten" }]} user={{ name: s.name, role: s.role }} home="/portaal">
      {children}
    </AppShell>
  );
}
