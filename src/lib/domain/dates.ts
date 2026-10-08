/**
 * Datums. Kalenderdatums zonder tijd zijn ISO-strings 'YYYY-MM-DD'.
 * Planning en weekgrenzen volgen Europe/Amsterdam; weken beginnen op maandag.
 */
export const TIME_ZONE = "Europe/Amsterdam";
export type ISODate = string;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isISODate = (v: unknown): v is ISODate => typeof v === "string" && ISO_RE.test(v);

/** Vandaag in Amsterdam als 'YYYY-MM-DD'. */
export function todayISO(now: Date = new Date()): ISODate {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function toUTC(d: ISODate): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}
function fromUTC(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  const x = toUTC(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fromUTC(x);
}

/** 1 = maandag … 7 = zondag */
export function isoWeekday(d: ISODate): number {
  const w = toUTC(d).getUTCDay();
  return w === 0 ? 7 : w;
}

export function weekStart(d: ISODate): ISODate {
  return addDays(d, 1 - isoWeekday(d));
}

export function weekRange(d: ISODate): { start: ISODate; end: ISODate } {
  const start = weekStart(d);
  return { start, end: addDays(start, 6) };
}

export function isoWeekNumber(d: ISODate): number {
  const date = toUTC(d);
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - isoWeekday(d));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  return Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((toUTC(to).getTime() - toUTC(from).getTime()) / 86400000);
}

/** Aantal werkdagen (ma–vr) na `from` tot en met `to`. 0 als to <= from. */
export function workdaysBetween(from: ISODate, to: ISODate): number {
  let count = 0;
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) {
    if (isoWeekday(d) <= 5) count++;
  }
  return count;
}

/** Kalenderdatum van een tijdstip (timestamptz) in Amsterdam. */
export function dateOfInstant(instant: string | Date): ISODate {
  return todayISO(typeof instant === "string" ? new Date(instant) : instant);
}

const WEEKDAYS = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"];
const WEEKDAYS_SHORT = ["ma", "di", "wo", "do", "vr", "za", "zo"];
const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

export function formatDate(d: ISODate | null | undefined, opts: { weekday?: boolean; year?: boolean } = {}): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  const parts = [`${day} ${MONTHS[m - 1]}`];
  if (opts.weekday) parts.unshift(WEEKDAYS_SHORT[isoWeekday(d) - 1]);
  if (opts.year) parts.push(String(y));
  return parts.join(" ");
}

export function weekdayName(d: ISODate): string {
  return WEEKDAYS[isoWeekday(d) - 1];
}

/** Relatieve omschrijving t.o.v. vandaag: 'vandaag', 'morgen', '3 dagen te laat'. */
export function relativeDay(d: ISODate, today: ISODate): string {
  const n = daysBetween(today, d);
  if (n === 0) return "vandaag";
  if (n === 1) return "morgen";
  if (n === -1) return "gisteren";
  if (n < 0) return `${-n} dagen te laat`;
  if (n < 7) return `over ${n} dagen`;
  return formatDate(d);
}

export function formatTime(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : "";
}

export function formatDateTime(instant: string | null | undefined): string {
  if (!instant) return "—";
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(instant));
}
