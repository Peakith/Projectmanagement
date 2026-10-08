import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/lib/auth";
import { Wordmark } from "@/components/wordmark";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Inloggen" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; fout?: string }> }) {
  const session = await getSession();
  if (session) redirect(homeFor(session.role));
  const { next, fout } = await searchParams;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-ink px-4 py-10">
      <div className="on-dark mb-8">
        <Wordmark href="/login" className="text-2xl" />
      </div>
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h1 className="mb-1 text-xl">Inloggen</h1>
        <p className="mb-5 text-sm text-zinc-600">Projectsysteem van Studio Brutaal. Accounts worden aangemaakt door de eigenaar.</p>
        {fout && (
          <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">
            {fout === "link" ? "Deze link is ongeldig of verlopen. Vraag een nieuwe aan." : "Er ging iets mis. Probeer het opnieuw."}
          </p>
        )}
        <LoginForm next={next ?? "/"} />
      </div>
    </main>
  );
}
