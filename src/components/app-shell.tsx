import Link from "next/link";
import { Bell, LogOut, Search } from "lucide-react";
import { Wordmark } from "./wordmark";
import { NavLinks, type NavItem } from "./nav-links";
import { ROLE_LABELS, type AppRole } from "@/lib/domain/labels";

export function AppShell({
  children,
  nav,
  user,
  unread,
  home = "/",
  showSearch = false,
  showBell = false,
}: {
  children: React.ReactNode;
  nav: NavItem[];
  user: { name: string; role: AppRole };
  unread?: number;
  home?: string;
  showSearch?: boolean;
  showBell?: boolean;
}) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <a href="#inhoud" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-2">
        Naar inhoud
      </a>
      {/* Zijbalk (desktop) */}
      <aside className="on-dark hidden bg-ink text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <div className="px-5 py-5">
          <Wordmark href={home} className="text-lg" />
        </div>
        <nav aria-label="Hoofdnavigatie" className="flex-1 px-3">
          <NavLinks items={nav} variant="side" />
        </nav>
        <div className="border-t border-white/10 px-5 py-4 text-sm">
          <p className="font-semibold">{user.name}</p>
          <p className="text-zinc-400">{ROLE_LABELS[user.role]}</p>
          <form action="/auth/uitloggen" method="post" className="mt-3">
            <button className="inline-flex items-center gap-2 text-zinc-300 hover:text-white">
              <LogOut className="size-4" aria-hidden /> Uitloggen
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Bovenbalk */}
        <header className="on-dark sticky top-0 z-30 bg-ink text-white lg:bg-white lg:text-ink lg:[&]:border-b lg:border-zinc-200">
          <div className="flex items-center gap-3 px-4 py-3 lg:px-6">
            <div className="lg:hidden">
              <Wordmark href={home} />
            </div>
            {showSearch && (
              <form action="/projecten" method="get" role="search" className="ml-auto hidden max-w-sm flex-1 items-center gap-2 sm:flex lg:ml-0">
                <label htmlFor="global-search" className="sr-only">
                  Zoek projecten
                </label>
                <div className="relative w-full">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-zinc-400" aria-hidden />
                  <input
                    id="global-search"
                    name="q"
                    placeholder="Zoek project of klant…"
                    className="h-9 w-full rounded-md border border-zinc-300 bg-white pl-8 pr-3 text-sm text-ink"
                  />
                </div>
              </form>
            )}
            <div className="ml-auto flex items-center gap-2">
              {showBell && (
                <Link href="/meldingen" className="relative rounded-md p-2 hover:bg-white/10 lg:hover:bg-zinc-100" aria-label={`Meldingen${unread ? `, ${unread} ongelezen` : ""}`}>
                  <Bell className="size-5" aria-hidden />
                  {!!unread && (
                    <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-brand px-1 text-center text-xs font-bold text-ink">{unread > 99 ? "99+" : unread}</span>
                  )}
                </Link>
              )}
              <form action="/auth/uitloggen" method="post" className="lg:hidden">
                <button className="rounded-md p-2 hover:bg-white/10" aria-label="Uitloggen">
                  <LogOut className="size-5" aria-hidden />
                </button>
              </form>
            </div>
          </div>
          <nav aria-label="Hoofdnavigatie (mobiel)" className="px-3 pb-2 lg:hidden">
            <NavLinks items={nav} variant="top" />
          </nav>
        </header>
        <main id="inhoud" className="mx-auto w-full max-w-[1400px] px-4 py-5 lg:px-6 lg:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
