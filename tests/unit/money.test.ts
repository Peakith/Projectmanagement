import { describe, expect, it } from "vitest";
import { formatCents, parseEuroToCents } from "@/lib/domain/money";
import { isSafeUrl } from "@/lib/domain/urls";

describe("geldbedragen exact in centen", () => {
  it.each([
    ["1234", 123400],
    ["1234,5", 123450],
    ["1.234,56", 123456],
    ["€ 1.234,56", 123456],
    ["1234.56", 123456],
    ["0,01", 1],
    ["18.500", 1850000],
  ])("%s => %i", (input, cents) => expect(parseEuroToCents(input)).toBe(cents));
  it("weigert ongeldige invoer", () => {
    expect(parseEuroToCents("abc")).toBeNull();
    expect(parseEuroToCents("1,234")).toBeNull();
    expect(parseEuroToCents("")).toBeNull();
  });
  it("geen afrondingsfouten van floats", () => {
    expect(parseEuroToCents("0,1")! + parseEuroToCents("0,2")!).toBe(30);
  });
  it("onbekend is iets anders dan nul", () => {
    expect(formatCents(null)).toBe("Onbekend");
    expect(formatCents(0)).toMatch(/0,00/);
  });
});

describe("externe links", () => {
  it("accepteert alleen http(s)", () => {
    expect(isSafeUrl("https://vimeo.com/123")).toBe(true);
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("data:text/html,x")).toBe(false);
    expect(isSafeUrl("https://x.nl/a b")).toBe(false);
    expect(isSafeUrl("ftp://x.nl")).toBe(false);
  });
});
