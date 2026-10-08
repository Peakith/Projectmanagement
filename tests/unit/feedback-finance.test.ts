import { describe, expect, it } from "vitest";
import { nextRoundInfo } from "@/lib/domain/feedback";
import { summarizeFinance, vatCents } from "@/lib/domain/finance";
import { closureIssues } from "@/lib/domain/closure";

describe("feedbackrondes per video", () => {
  it("eerste en tweede ronde zijn inbegrepen", () => {
    expect(nextRoundInfo(2, [], false)).toMatchObject({ nextRoundNumber: 1, requiresExtraApproval: false });
    expect(nextRoundInfo(2, [{ round_number: 1, is_extra: false, status: "verwerkt" }], false)).toMatchObject({ nextRoundNumber: 2, requiresExtraApproval: false });
  });
  it("na twee rondes: scope-signaal en extra goedkeuring nodig", () => {
    const r = nextRoundInfo(2, [{ round_number: 1, is_extra: false, status: "verwerkt" }, { round_number: 2, is_extra: false, status: "verwerkt" }], false);
    expect(r).toMatchObject({ nextRoundNumber: 3, requiresExtraApproval: true, scopeWarning: true });
  });
  it("na akkoord geen scope-signaal", () => {
    const r = nextRoundInfo(2, [{ round_number: 1, is_extra: false, status: "verwerkt" }, { round_number: 2, is_extra: false, status: "verwerkt" }], true);
    expect(r.scopeWarning).toBe(false);
  });
  it("lopende ronde blokkeert een nieuwe ronde", () => {
    expect(nextRoundInfo(2, [{ round_number: 1, is_extra: false, status: "wacht_op_feedback" }], false).blockedByOpenRound).toBe(true);
  });
});

describe("financiën", () => {
  const today = "2026-10-08";
  it("meerdere facturen en deelbetalingen; openstaand volgt betalingen", () => {
    const s = summarizeFinance(
      {
        quote_amount_cents: 1200000,
        extra_work: [{ amount_cents: 75000, status: "goedgekeurd" }, { amount_cents: 99999, status: "voorgesteld" }],
        costs: [{ kind: "werkelijk", amount_cents: 130000 }],
        invoices: [
          { id: "a", amount_excl_cents: 600000, vat_cents: 126000, status: "verstuurd", due_on: "2026-09-01" },
          { id: "b", amount_excl_cents: 675000, vat_cents: 141750, status: "verstuurd", due_on: "2026-10-02" },
        ],
        payments: [
          { invoice_id: "a", amount_cents: 726000 },
          { invoice_id: "b", amount_cents: 300000 },
        ],
      },
      today,
    );
    expect(s.revenue_cents).toBe(1275000);
    expect(s.paid_cents).toBe(1026000);
    expect(s.outstanding_cents).toBe(516750);
    expect(s.invoices.map((i) => i.state)).toEqual(["betaald", "vervallen"]);
    expect(s.actual_contribution_cents).toBe(1145000);
    expect(s.actual_contribution_pct).toBe(89.8);
  });
  it("deelbetaling maakt een factuur niet volledig betaald", () => {
    const s = summarizeFinance({ quote_amount_cents: 100, extra_work: [], costs: [], invoices: [{ id: "x", amount_excl_cents: 1000, vat_cents: 210, status: "verstuurd", due_on: "2026-12-01" }], payments: [{ invoice_id: "x", amount_cents: 1209 }] }, today);
    expect(s.invoices[0].state).toBe("deels_betaald");
    expect(s.outstanding_cents).toBe(1);
  });
  it("ontbrekende kosten = onbekend, niet 100% marge", () => {
    const s = summarizeFinance({ quote_amount_cents: 500000, extra_work: [], costs: [], invoices: [], payments: [] }, today);
    expect(s.actual_costs_cents).toBeNull();
    expect(s.actual_contribution_cents).toBeNull();
    expect(s.actual_contribution_pct).toBeNull();
  });
  it("ontbrekende offerte = opbrengst onbekend", () => {
    expect(summarizeFinance({ quote_amount_cents: null, extra_work: [], costs: [{ kind: "werkelijk", amount_cents: 1 }], invoices: [], payments: [] }, today).actual_contribution_cents).toBeNull();
  });
  it("btw apart en op hele centen", () => {
    expect(vatCents(925000, 21)).toBe(194250);
    expect(vatCents(333, 21)).toBe(70);
  });
});

describe("afrondingscheck", () => {
  it("meldt ontbrekend akkoord, links, open taken en (eigenaar) financiën", () => {
    const issues = closureIssues({
      deliverables: [{ name: "Film", approved: false, final_link_count: 0 }],
      tasks: [{ title: "x", status: "todo", optional: false }, { title: "y", status: "todo", optional: true }],
      finance: { outstanding_cents: 10, revenue_known: true, actual_costs_known: false, open_followups: 0 },
    });
    expect(issues).toEqual([
      'Geen klantakkoord voor "Film"',
      'Geen definitieve bestanden/links voor "Film"',
      "1 relevante taak/taken nog open",
      "Werkelijke kosten niet vastgelegd",
      "Er staan nog facturen open",
    ]);
  });
  it("zonder finance-invoer (medewerker) geen financiële punten", () => {
    expect(closureIssues({ deliverables: [{ name: "F", approved: true, final_link_count: 1 }], tasks: [] })).toEqual([]);
  });
});
