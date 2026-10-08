import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { csvResponse, toCsv } from "@/lib/csv";
import { PHASE_LABELS, type Phase } from "@/lib/domain/labels";
import { todayISO } from "@/lib/domain/dates";

/** Operationele export voor het interne team. Bevat bewust geen financiële gegevens. */
export async function GET() {
  const s = await getSession();
  if (s?.role !== "owner" && s?.role !== "employee") return new NextResponse("Niet gevonden", { status: 404 });
  const [{ data: projects }, { data: clients }, { data: staff }] = await Promise.all([
    s.supabase.from("projects").select("name, client_id, phase, priority, lead_id, start_date, deadline, next_action_text, next_action_date, archived_at").order("name"),
    s.supabase.from("clients").select("id, name"),
    s.supabase.from("profiles").select("id, full_name"),
  ]);
  const c = new Map((clients ?? []).map((x) => [x.id, x.name]));
  const p = new Map((staff ?? []).map((x) => [x.id, x.full_name]));
  const rows = [
    ["Project", "Klant", "Fase", "Prioriteit", "Verantwoordelijke", "Start", "Deadline", "Losse volgende actie", "Datum volgende actie", "Gearchiveerd"],
    ...(projects ?? []).map((x) => [x.name, c.get(x.client_id ?? ""), PHASE_LABELS[x.phase as Phase], x.priority, p.get(x.lead_id ?? ""), x.start_date, x.deadline, x.next_action_text, x.next_action_date, x.archived_at ? "ja" : "nee"]),
  ];
  return csvResponse(`projecten-${todayISO()}.csv`, toCsv(rows));
}
