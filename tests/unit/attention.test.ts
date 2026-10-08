import { describe, expect, it } from "vitest";
import { computeAttention, type AttentionProject, type AttentionTask } from "@/lib/domain/attention";

const T = "2026-10-08"; // donderdag
const base: AttentionProject = {
  phase: "postproductie",
  deadline: "2026-11-01",
  health: "op_schema",
  health_note: "",
  next_action_task_id: "t1",
  next_action_text: null,
  next_action_date: "2026-10-09",
  next_action_needs_update: false,
  follow_up_date: null,
};
const task = (p: Partial<AttentionTask>): AttentionTask => ({ title: "Taak", status: "todo", due_date: null, optional: false, waiting_since: null, blocked_reason: null, ...p });

describe("aandachtsindicatie", () => {
  it("op schema zonder signalen", () => {
    expect(computeAttention(base, [task({ due_date: "2026-10-10" })], [], T)).toEqual({ level: "op_schema", reasons: [], notes: [] });
  });
  it("verstreken projectdeadline is uitlegbaar", () => {
    const a = computeAttention({ ...base, deadline: "2026-10-01" }, [], [], T);
    expect(a.level).toBe("aandacht");
    expect(a.reasons[0]).toMatch(/Projectdeadline verstreken/);
  });
  it("een overgeslagen of te late optionele taak maakt een project niet rood", () => {
    const a = computeAttention(base, [task({ optional: true, due_date: "2026-10-01" }), task({ optional: true, status: "nvt" })], [], T);
    expect(a.level).toBe("op_schema");
    expect(a.notes.length).toBe(1);
  });
  it("geblokkeerde verplichte taak => geblokkeerd met reden", () => {
    const a = computeAttention(base, [task({ status: "geblokkeerd", title: "Muziek", blocked_reason: "Licentie" })], [], T);
    expect(a.level).toBe("geblokkeerd");
    expect(a.reasons).toContain("Geblokkeerd: Muziek — Licentie");
  });
  it("wacht op klant: pas vanaf 3 werkdagen aandacht, met aantal werkdagen", () => {
    const short = computeAttention(base, [task({ status: "wacht_klant", waiting_since: "2026-10-06T10:00:00+02:00" })], [], T);
    expect(short.level).toBe("op_schema");
    expect(short.notes[0]).toBe("Wacht op klant sinds 2 werkdagen");
    const long = computeAttention(base, [task({ status: "wacht_klant", waiting_since: "2026-10-02T10:00:00+02:00" })], [], T);
    expect(long.level).toBe("aandacht");
    expect(long.reasons).toContain("Wacht op klant sinds 4 werkdagen");
  });
  it("ontbrekende of afgeronde volgende actie", () => {
    expect(computeAttention({ ...base, next_action_task_id: null }, [], [], T).reasons).toContain("Geen eerstvolgende actie");
    expect(computeAttention({ ...base, next_action_needs_update: true }, [], [], T).reasons).toContain("Volgende actie is afgerond — kies een nieuwe");
  });
  it("onbevestigde crew voor een draaidag binnen een week", () => {
    const a = computeAttention(base, [], [{ shoot_date: "2026-10-10", booking_statuses: ["bevestigd", "optie"] }], T);
    expect(a.reasons[0]).toMatch(/Crew niet bevestigd/);
    expect(computeAttention(base, [], [{ shoot_date: "2026-10-10", booking_statuses: ["bevestigd"] }], T).level).toBe("op_schema");
  });
  it("afgeronde projecten krijgen geen signalen", () => {
    expect(computeAttention({ ...base, phase: "afgerond", deadline: "2020-01-01" }, [], [], T).level).toBe("op_schema");
  });
});
