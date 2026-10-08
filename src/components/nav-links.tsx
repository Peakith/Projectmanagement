"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string };

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function NavLinks({ items, variant }: { items: NavItem[]; variant: "side" | "top" }) {
  const path = usePathname();
  return (
    <ul className={variant === "side" ? "flex flex-col gap-1" : "flex gap-1 overflow-x-auto"}>
      {items.map((i) => {
        const active = isActive(path, i.href);
        return (
          <li key={i.href} className="shrink-0">
            <Link
              href={i.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "block rounded-md px-3 py-2 text-sm font-semibold transition-colors",
                variant === "side"
                  ? active
                    ? "bg-brand text-ink"
                    : "text-zinc-200 hover:bg-white/10 hover:text-white"
                  : active
                    ? "bg-brand text-ink"
                    : "text-zinc-200 hover:bg-white/10",
              )}
            >
              {i.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
