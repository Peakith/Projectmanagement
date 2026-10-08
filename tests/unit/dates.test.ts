import { describe, expect, it } from "vitest";
import { addDays, isoWeekNumber, relativeDay, todayISO, weekRange, workdaysBetween } from "@/lib/domain/dates";

describe("datums (Europe/Amsterdam, week begint op maandag)", () => {
  it("vandaag volgt Amsterdamse tijd, niet UTC", () => {
    // 23:30 UTC op 8 okt = 01:30 op 9 okt in Amsterdam (zomertijd)
    expect(todayISO(new Date("2026-10-08T23:30:00Z"))).toBe("2026-10-09");
    // winter: 23:30 UTC 15 jan = 00:30 16 jan
    expect(todayISO(new Date("2026-01-15T23:30:00Z"))).toBe("2026-01-16");
  });
  it("week loopt van maandag tot zondag", () => {
    expect(weekRange("2026-10-08")).toEqual({ start: "2026-10-05", end: "2026-10-11" });
    expect(weekRange("2026-10-11")).toEqual({ start: "2026-10-05", end: "2026-10-11" }); // zondag
    expect(weekRange("2026-10-12")).toEqual({ start: "2026-10-12", end: "2026-10-18" }); // maandag
  });
  it("ISO-weeknummer", () => {
    expect(isoWeekNumber("2026-10-08")).toBe(41);
    expect(isoWeekNumber("2027-01-01")).toBe(53);
  });
  it("werkdagen tellen weekenden niet mee", () => {
    expect(workdaysBetween("2026-10-02", "2026-10-05")).toBe(1); // vr -> ma
    expect(workdaysBetween("2026-10-05", "2026-10-09")).toBe(4);
    expect(workdaysBetween("2026-10-09", "2026-10-09")).toBe(0);
  });
  it("datumrekenen over zomertijd heen blijft kalenderzuiver", () => {
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
  });
  it("relatieve omschrijving", () => {
    expect(relativeDay("2026-10-08", "2026-10-08")).toBe("vandaag");
    expect(relativeDay("2026-10-06", "2026-10-08")).toBe("2 dagen te laat");
  });
});
