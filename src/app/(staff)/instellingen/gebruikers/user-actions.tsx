"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Select } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";
import { linkFreelancer, newLoginLink, setActive, setRole } from "../actions";
import { LinkResult } from "./invite-form";

export function UserActions({
  userId,
  role,
  active,
  freelancerId,
  freelancers,
}: {
  userId: string;
  role: string | null;
  active: boolean;
  freelancerId: string | null;
  freelancers: { id: string; name: string }[];
}) {
  const [linkState, setLinkState] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <ActionForm action={setRole.bind(null, userId)} success="Rol gewijzigd" className="flex items-end gap-1">
          <label htmlFor={`role-${userId}`} className="sr-only">
            Rol
          </label>
          <Select id={`role-${userId}`} name="role" defaultValue={role ?? "employee"} className="h-8 w-44 text-xs">
            <option value="employee">Medewerker / stagiaire</option>
            <option value="freelancer">Freelancer</option>
            <option value="client">Klant</option>
          </Select>
          <SubmitButton size="sm" variant="outline">
            {role ? "Wijzig rol" : "Geef rol"}
          </SubmitButton>
        </ActionForm>
        {role && (
          <Button
            size="sm"
            variant={active ? "outline" : "dark"}
            disabled={pending}
            onClick={() => {
              if (active && !window.confirm("Toegang intrekken? De gebruiker kan direct niets meer zien.")) return;
              start(async () => {
                const r = await setActive(userId, !active);
                if (r.ok) toast.success(r.message ?? "");
                else toast.error(r.error);
              });
            }}
          >
            {active ? "Toegang intrekken" : "Toegang herstellen"}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setLinkState(await newLoginLink(userId));
            })
          }
        >
          Nieuwe inloglink
        </Button>
      </div>
      {role === "freelancer" && (
        <ActionForm action={linkFreelancer.bind(null, userId)} success="Gekoppeld" className="flex items-end gap-1">
          <label htmlFor={`fl-${userId}`} className="sr-only">
            Freelancerregistratie
          </label>
          <Select id={`fl-${userId}`} name="freelancer_id" defaultValue={freelancerId ?? ""} className="h-8 w-44 text-xs">
            <option value="">Kies registratie…</option>
            {freelancers.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
          <SubmitButton size="sm" variant="outline">
            Koppel
          </SubmitButton>
        </ActionForm>
      )}
      <LinkResult state={linkState} />
    </div>
  );
}
