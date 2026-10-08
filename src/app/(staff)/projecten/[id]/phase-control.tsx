"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ActionButton } from "@/components/action-button";
import { Label, Select } from "@/components/ui/input";
import { PHASES, PHASE_LABELS, type Phase } from "@/lib/domain/labels";
import { setArchived, setPhase } from "./_actions/project";

export function PhaseControl({ projectId, phase, archived }: { projectId: string; phase: Phase; archived: boolean }) {
  const [value, setValue] = useState<Phase>(phase);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <ActionForm action={setPhase.bind(null, projectId)} success="Fase gewijzigd" className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="phase-select" className="text-xs">
            Fase
          </Label>
          <Select id="phase-select" name="phase" value={value} onChange={(e) => setValue(e.target.value as Phase)} className="w-52">
            {PHASES.map((p) => (
              <option key={p} value={p}>
                {PHASE_LABELS[p]}
              </option>
            ))}
          </Select>
        </div>
        {value === "afgerond" && phase !== "afgerond" && (
          <label className="flex max-w-56 items-center gap-2 text-xs">
            <input type="checkbox" name="confirm_closure" className="size-4 accent-ink" />
            Ik heb de afrondingscheck op het overzicht bekeken
          </label>
        )}
        <SubmitButton variant="dark" disabled={value === phase}>
          Fase wijzigen
        </SubmitButton>
      </ActionForm>
      <ActionButton
        variant="outline"
        action={setArchived.bind(null, projectId, !archived)}
        confirm={archived ? undefined : "Project archiveren? Het verdwijnt uit het dashboard maar blijft bewaard en is terug te zetten."}
      >
        {archived ? "Uit archief halen" : "Archiveren"}
      </ActionButton>
    </div>
  );
}
