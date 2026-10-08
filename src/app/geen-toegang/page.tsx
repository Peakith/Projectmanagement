import Link from "next/link";
import { getSession, homeFor } from "@/lib/auth";
import { Wordmark } from "@/components/wordmark";

export default async function NoAccess() {
  const session = await getSession();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-ink px-4 text-center text-white">
      <div className="on-dark">
        <Wordmark href={session?.role ? homeFor(session.role) : "/login"} className="text-2xl" />
      </div>
      <div className="max-w-md rounded-lg bg-white p-6 text-ink">
        <h1 className="text-xl">Geen toegang</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {session?.role
            ? "Je account heeft geen toegang tot deze pagina."
            : "Je bent ingelogd, maar je account heeft (nog) geen rol in het systeem. Vraag de eigenaar om je toegang te geven. Ben jij de eigenaar en is dit een nieuwe installatie? Stel dan eerst de eigenaarsrol in (README → 'Eigenaar registreren')."}
        </p>
        <div className="mt-4 flex justify-center gap-3">
          {session?.role && (
            <Link className="font-semibold underline" href={homeFor(session.role)}>
              Naar mijn startpagina
            </Link>
          )}
          {session && (
            <form action="/auth/uitloggen" method="post">
              <button className="font-semibold underline">Uitloggen</button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
