"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { addDocument } from "../_actions/documents";

export function DocumentForm({ projectId }: { projectId: string }) {
  const [kind, setKind] = useState<"link" | "file">("link");
  return (
    <ActionForm action={addDocument.bind(null, projectId)} resetOnSuccess className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" encType="multipart/form-data">
      <Field label="Soort" htmlFor="doc-kind">
        <Select id="doc-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as "link" | "file")}>
          <option value="link">Link</option>
          <option value="file">Bestand</option>
        </Select>
      </Field>
      <Field label="Titel" htmlFor="doc-title" required>
        <Input id="doc-title" name="title" required maxLength={200} />
      </Field>
      {kind === "link" ? (
        <Field label="Link" htmlFor="doc-url" required>
          <Input id="doc-url" name="url" type="url" required placeholder="https://" />
        </Field>
      ) : (
        <Field label="Bestand (max. 10 MB)" htmlFor="doc-file" required>
          <Input id="doc-file" name="file" type="file" required className="py-1.5" />
        </Field>
      )}
      <Field label="Zichtbaarheid" htmlFor="doc-vis">
        <Select id="doc-vis" name="visibility" defaultValue="internal">
          <option value="internal">Alleen intern</option>
          <option value="crew">Delen met geboekte crew</option>
        </Select>
      </Field>
      <div>
        <SubmitButton size="sm">Toevoegen</SubmitButton>
      </div>
    </ActionForm>
  );
}
