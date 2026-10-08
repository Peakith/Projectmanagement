"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function TabsNav({ base, tabs }: { base: string; tabs: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Projectonderdelen" className="-mx-4 mb-5 overflow-x-auto border-b border-zinc-200 px-4 lg:mx-0 lg:px-0">
      <ul className="flex gap-1">
        {tabs.map((t) => {
          const href = base + t.href;
          const active = t.href === "" ? path === base : path === href || path.startsWith(href + "/");
          return (
            <li key={t.href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn("block border-b-2 px-3 py-2 text-sm font-semibold", active ? "border-brand text-ink" : "border-transparent text-zinc-600 hover:text-ink")}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
