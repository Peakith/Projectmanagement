"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { requestReset, signIn } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"login" | "reset">("login");
  if (mode === "reset") {
    return (
      <ActionForm action={requestReset} success={false} className="flex flex-col gap-4">
        <Field label="E-mailadres" htmlFor="reset-email">
          <Input id="reset-email" name="email" type="email" autoComplete="email" required />
        </Field>
        <SubmitButton>Stuur resetlink</SubmitButton>
        <Button type="button" variant="link" onClick={() => setMode("login")}>
          Terug naar inloggen
        </Button>
      </ActionForm>
    );
  }
  return (
    <ActionForm action={signIn} success={false} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="E-mailadres" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <Field label="Wachtwoord" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton>Inloggen</SubmitButton>
      <Button type="button" variant="link" onClick={() => setMode("reset")}>
        Wachtwoord vergeten?
      </Button>
    </ActionForm>
  );
}
