/** Geldbedragen worden exact opgeslagen als integer eurocenten. */
export function formatCents(cents: number | null | undefined, opts: { unknown?: string } = {}): string {
  if (cents === null || cents === undefined) return opts.unknown ?? "Onbekend";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);
}

/**
 * Parseert een door een mens ingevoerd eurobedrag naar centen.
 * Accepteert '1234', '1234,5', '1.234,56', '€ 1.234,56', '1234.56'. Geeft null bij ongeldige invoer.
 */
export function parseEuroToCents(input: string): number | null {
  let s = input.trim().replace(/€|\s/g, "");
  if (!s) return null;
  if (!/^-?[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // Het laatste scheidingsteken is de decimale komma/punt.
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    s = s.replace(",", ".");
  } else if (lastDot > -1) {
    // '1.234' (duizendtal) vs '12.5' (decimaal)
    const decimals = s.length - lastDot - 1;
    if (decimals === 3 && s.split(".").length >= 2) s = s.replace(/\./g, "");
  }
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isSafeInteger(cents)) return null;
  return s.startsWith("-") ? -cents : cents;
}

export function percent(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}
