"use client";
import { useActionState, useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import type { ActionResult } from "@/lib/action-result";
import { inviteUser } from "../actions";

export function LinkResult({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  if (!state.ok)
    return (
      <p role="alert" className="text-sm font-semibold text-red-700">
        {state.error}
      </p>
    );
  const d = state.data as { link: string; email: string } | undefined;
  if (!d) return null;
  return (
    <Alert tone="ok" title={`${state.message} voor ${d.email}`}>
      <p className="mb-2">Stuur deze eenmalige link zelf naar de gebruiker (24 uur geldig). Hiermee kiest hij of zij een wachtwoord.</p>
      <div className="flex gap-2">
        <Input readOnly value={d.link} aria-label="Uitnodigingslink" onFocus={(e) => e.currentTarget.select()} />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            navigator.clipboard.writeText(d.link).then(() => toast.success("Link gekopieerd"));
          }}
        >
          <Copy aria-hidden /> Kopieer
        </Button>
      </div>
    </Alert>
  );
}

export function InviteForm({ freelancers, projects }: { freelancers: { id: string; name: string }[]; projects: { id: string; name: string }[] }) {
  const [state, action] = useActionState(inviteUser, null);
  const [role, setRole] = useState("employee");
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="Naam" htmlFor="iv-name" required>
        <Input id="iv-name" name="full_name" required maxLength={120} />
      </Field>
      <Field label="E-mailadres" htmlFor="iv-email" required>
        <Input id="iv-email" name="email" type="email" required />
      </Field>
      <Field label="Rol" htmlFor="iv-role">
        <Select id="iv-role" name="role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="employee">Medewerker / stagiaire</option>
          <option value="freelancer">Freelancer (beperkte toegang)</option>
          <option value="client">Klant (alleen portaal)</option>
        </Select>
      </Field>
      {role === "freelancer" && (
        <Field label="Koppel aan freelancerregistratie" htmlFor="iv-fl" hint="Zonder koppeling ziet de freelancer niets.">
          <Select id="iv-fl" name="freelancer_id" defaultValue="">
            <option value="">—</option>
            {freelancers.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {role === "client" && (
        <Field label="Toegang tot project (optioneel)" htmlFor="iv-pr">
          <Select id="iv-pr" name="project_id" defaultValue="">
            <option value="">—</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="sm:col-span-2">
        <SubmitButton>Account aanmaken</SubmitButton>
      </div>
      <div className="sm:col-span-2">
        <LinkResult state={state} />
      </div>
    </form>
  );
}
