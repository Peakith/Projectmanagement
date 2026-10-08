import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { AVAILABILITY, AVAILABILITY_LABELS } from "@/lib/domain/labels";
import type { Freelancer } from "@/lib/types";

export function FreelancerForm({ action, f }: { action: Parameters<typeof ActionForm>[0]["action"]; f?: Freelancer }) {
  return (
    <ActionForm action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="Naam" htmlFor="f-name" required>
        <Input id="f-name" name="name" defaultValue={f?.name} required maxLength={200} />
      </Field>
      <Field label="Specialismen" htmlFor="f-spec" hint="Komma-gescheiden, bijv. Camera, Licht">
        <Input id="f-spec" name="specialisms" defaultValue={f?.specialisms.join(", ")} maxLength={300} />
      </Field>
      <Field label="E-mail" htmlFor="f-email">
        <Input id="f-email" name="email" type="email" defaultValue={f?.email ?? ""} />
      </Field>
      <Field label="Telefoon" htmlFor="f-phone">
        <Input id="f-phone" name="phone" defaultValue={f?.phone ?? ""} maxLength={40} />
      </Field>
      <Field label="Woonplaats" htmlFor="f-city">
        <Input id="f-city" name="city" defaultValue={f?.city} maxLength={100} />
      </Field>
      <Field label="Beschikbaarheid" htmlFor="f-av">
        <Select id="f-av" name="availability" defaultValue={f?.availability ?? "onbekend"}>
          {AVAILABILITY.map((a) => (
            <option key={a} value={a}>
              {AVAILABILITY_LABELS[a]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Toelichting beschikbaarheid" htmlFor="f-avn" className="sm:col-span-2">
        <Input id="f-avn" name="availability_note" defaultValue={f?.availability_note} maxLength={300} />
      </Field>
      <Field label="Notities (intern, geen tarieven)" htmlFor="f-notes" className="sm:col-span-2">
        <Textarea id="f-notes" name="notes" defaultValue={f?.notes} maxLength={4000} />
      </Field>
      {f && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="active" defaultChecked={f.active} /> Actief
        </label>
      )}
      <div className="sm:col-span-2">
        <SubmitButton size="sm">{f ? "Opslaan" : "Freelancer toevoegen"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
