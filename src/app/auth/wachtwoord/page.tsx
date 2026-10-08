import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Wordmark } from "@/components/wordmark";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { setPassword } from "./actions";

export const metadata: Metadata = { title: "Wachtwoord instellen" };

export default async function PasswordPage() {
  const session = await getSession();
  if (!session) redirect("/login?fout=link");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-ink px-4">
      <div className="on-dark mb-8">
        <Wordmark href="/" className="text-2xl" />
      </div>
      <div className="w-full max-w-sm rounded-lg bg-white p-6">
        <h1 className="mb-1 text-xl">Wachtwoord instellen</h1>
        <p className="mb-5 text-sm text-zinc-600">Voor {session.email}. Minimaal 10 tekens.</p>
        <ActionForm action={setPassword} success={false} className="flex flex-col gap-4">
          <Field label="Nieuw wachtwoord" htmlFor="password">
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
          </Field>
          <Field label="Herhaal wachtwoord" htmlFor="confirm">
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
          </Field>
          <SubmitButton>Opslaan en doorgaan</SubmitButton>
        </ActionForm>
      </div>
    </main>
  );
}
