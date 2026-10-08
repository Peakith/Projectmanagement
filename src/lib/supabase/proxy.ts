import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublicKey, supabaseUrl } from "@/lib/env";

const PUBLIC_PATHS = ["/login", "/auth/", "/status", "/api/cron/", "/api/integrations/"];

/** Ververst de sessie per verzoek en stuurt niet-ingelogde bezoekers naar /login. */
export async function updateSession(request: NextRequest) {
  const url = supabaseUrl();
  const key = supabasePublicKey();
  if (!url || !key) {
    // Configuratie ontbreekt: stuur naar de diagnosepagina in plaats van een kale serverfout.
    if (request.nextUrl.pathname === "/status") return NextResponse.next({ request });
    return NextResponse.redirect(new URL("/status", request.url));
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });

  // Niet verwijderen: ververst zo nodig het token.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p));
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = path !== "/" ? `?next=${encodeURIComponent(path + request.nextUrl.search)}` : "";
    return NextResponse.redirect(url);
  }
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
