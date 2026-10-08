import { isOpenStatus, type TaskStatus } from "./labels";

export type ClosureInput = {
  deliverables: { name: string; approved: boolean; final_link_count: number }[];
  tasks: { title: string; status: TaskStatus; optional: boolean }[];
  /** Alleen voor de eigenaar meegeven. */
  finance?: { outstanding_cents: number; revenue_known: boolean; actual_costs_known: boolean; open_followups: number };
};

/** Controle vóór afronden: ontbrekende deliverables, akkoord, relevante taken en (eigenaar) financiën. */
export function closureIssues(input: ClosureInput): string[] {
  const issues: string[] = [];
  if (input.deliverables.length === 0) issues.push("Er zijn geen deliverables vastgelegd");
  for (const d of input.deliverables) {
    if (!d.approved) issues.push(`Geen klantakkoord voor "${d.name}"`);
    if (d.final_link_count === 0) issues.push(`Geen definitieve bestanden/links voor "${d.name}"`);
  }
  const open = input.tasks.filter((t) => isOpenStatus(t.status) && !t.optional);
  if (open.length > 0) issues.push(`${open.length} relevante taak/taken nog open`);
  if (input.finance) {
    if (!input.finance.revenue_known) issues.push("Offertebedrag niet vastgelegd");
    if (!input.finance.actual_costs_known) issues.push("Werkelijke kosten niet vastgelegd");
    if (input.finance.outstanding_cents > 0) issues.push("Er staan nog facturen open");
    if (input.finance.open_followups > 0) issues.push(`${input.finance.open_followups} financiële opvolging(en) open`);
  }
  return issues;
}
