import type { Metadata } from "next";
import { headers } from "next/headers";
import { CheckCircle2, CircleHelp, XCircle } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { env, supabasePublicKey, supabaseSecretKey, supabaseUrl } from "@/lib/env";
import { Wordmark } from "@/components/wordmark";

export const metadata: Metadata = { title: "Status", robots: { index: false } };
export const dynamic = "force-dynamic";

type Check = { label: string; ok: boolean | null; fix?: string };

/**
 * Installatiecontrole. Toont uitsluitend ja/nee-uitkomsten en nooit sleutels of gegevens,
 * zodat de eigenaar zelf kan zien waarom inloggen in een nieuwe omgeving niet lukt.
 */
async function runChecks(host: string | null, proto: string): Promise<Check[]> {
  const url = supabaseUrl();
  const pub = supabasePublicKey();
  const secret = supabaseSecretKey();
  const checks: Check[] = [
    { label: "NEXT_PUBLIC_SUPABASE_URL is ingesteld", ok: !!url, fix: "Zet in Vercel → Settings → Environment Variables de Project URL uit Supabase (Settings → API) en deploy opnieuw." },
    {
      label: "Publieke Supabase-sleutel is ingesteld",
      ok: !!pub,
      fix: "Zet NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (of NEXT_PUBLIC_SUPABASE_ANON_KEY) met de anon/publishable key uit Supabase en deploy opnieuw.",
    },
    {
      label: "Geheime Supabase-sleutel is ingesteld (alleen server)",
      ok: !!secret,
      fix: "Zet SUPABASE_SECRET_KEY (of SUPABASE_SERVICE_ROLE_KEY). Nodig voor uitnodigen, jobs en deze controle. Nooit met NEXT_PUBLIC_ ervoor.",
    },
  ];
  const appHost = (() => {
    try {
      return new URL(env.appUrl).host;
    } catch {
      return null;
    }
  })();
  checks.push({
    label: `APP_URL past bij dit adres (${appHost ?? "?"})`,
    ok: host ? appHost === host : null,
    fix: `Zet APP_URL op ${proto}://${host ?? "<jouw-domein>"} (anders werken uitnodigings- en wachtwoordlinks niet) en zet hetzelfde adres in Supabase → Authentication → URL Configuration (Site URL + redirect ${proto}://${host ?? "<domein>"}/auth/callback).`,
  });
  if (!url || !pub) return checks;

  let authOk = false;
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: pub }, cache: "no-store" });
    authOk = res.ok;
    if (res.ok) {
      const s = (await res.json()) as { disable_signup?: boolean };
      checks.push({ label: "Supabase Auth is bereikbaar met deze sleutel", ok: true });
      checks.push({ label: "Open registratie staat uit", ok: s.disable_signup === true, fix: "Supabase → Authentication → Sign In / Providers: zet 'Allow new users to sign up' uit." });
    } else {
      checks.push({ label: "Supabase Auth is bereikbaar met deze sleutel", ok: false, fix: `Antwoord ${res.status}. Controleer of URL en publieke sleutel bij hetzelfde Supabase-project horen.` });
    }
  } catch {
    checks.push({ label: "Supabase Auth is bereikbaar", ok: false, fix: "De Supabase-URL is niet bereikbaar. Controleer de waarde (https://<project>.supabase.co)." });
  }
  if (!authOk || !secret) {
    if (!secret) checks.push({ label: "Database-controles", ok: null, fix: "Overgeslagen zonder geheime sleutel." });
    return checks;
  }

  // Alleen tellingen (head-verzoeken); er worden geen rijen opgehaald of getoond.
  const admin = createAdminClient();
  const { error: tplErr, count: tplCount } = await admin.from("templates").select("id", { count: "exact", head: true });
  const migrated = !tplErr && (tplCount ?? 0) > 0;
  checks.push({
    label: "Database-migraties zijn toegepast (tabellen + standaardtemplate)",
    ok: migrated,
    fix: "Voer de migraties uit: `npx supabase link --project-ref <ref>` en `npx supabase db push` (of plak de bestanden uit supabase/migrations op volgorde in de SQL Editor).",
  });
  if (!migrated) return checks;
  const { error: finErr } = await admin.schema("finance").from("project_finances").select("project_id", { head: true, count: "exact" });
  checks.push({ label: "Schema 'finance' is beschikbaar via de API", ok: !finErr, fix: "Supabase → Settings → API (Data API) → Exposed schemas: voeg 'finance' toe." });
  const { count: owners } = await admin.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "owner").eq("active", true);
  checks.push({
    label: "Er is een eigenaar ingesteld",
    ok: (owners ?? 0) > 0,
    fix: "Maak de eigenaar aan: zie README → 'Eigenaar registreren' (via npm run owner:create of via het Supabase-dashboard + SQL in supabase/snippets/eigenaar-instellen.sql).",
  });
  return checks;
}

export default async function StatusPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const checks = await runChecks(host, proto);
  const allOk = checks.every((c) => c.ok !== false);
  return (
    <main className="flex min-h-dvh flex-col items-center bg-ink px-4 py-10">
      <div className="on-dark mb-6">
        <Wordmark href="/login" className="text-2xl" />
      </div>
      <div className="w-full max-w-2xl rounded-lg bg-white p-6">
        <h1 className="text-xl">Installatiecontrole</h1>
        <p className="mb-4 mt-1 text-sm text-zinc-600">
          {allOk ? "Alles is in orde. Lukt inloggen nog steeds niet, controleer dan het e-mailadres/wachtwoord of maak een nieuwe inloglink." : "Een of meer onderdelen zijn nog niet goed ingesteld. Los ze van boven naar beneden op."}
        </p>
        <ul className="flex flex-col gap-3">
          {checks.map((c) => (
            <li key={c.label} className="flex gap-3 text-sm">
              {c.ok === true ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-700" aria-label="In orde" />
              ) : c.ok === false ? (
                <XCircle className="mt-0.5 size-5 shrink-0 text-red-700" aria-label="Niet in orde" />
              ) : (
                <CircleHelp className="mt-0.5 size-5 shrink-0 text-zinc-500" aria-label="Onbekend" />
              )}
              <div>
                <p className="font-semibold">{c.label}</p>
                {c.ok !== true && c.fix && <p className="text-zinc-700">{c.fix}</p>}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-xs text-zinc-500">Deze pagina toont geen sleutels of gegevens. Na het wijzigen van omgevingsvariabelen in Vercel is een nieuwe deploy nodig.</p>
      </div>
    </main>
  );
}
