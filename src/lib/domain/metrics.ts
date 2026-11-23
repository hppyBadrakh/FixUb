// Metric definitions follow the design system's "Metric definitions" table.
import { dayKey } from "../format";
import type { Catalog } from "../catalog";
import { OPEN_STATUSES } from "../meta";
import type { Lang, Report } from "../types";

export const isOpen = (r: Report) => OPEN_STATUSES.includes(r.status);

/** "Subcategory · place", e.g. "Pothole or damaged road surface · Peace Avenue". */
export function reportTitle(r: Report, lang: Lang, catalog: Catalog): string {
  const place = placeOf(r, lang);
  const what = catalog.subLabel(r.category, r.subcategory, lang);
  return place ? `${what} · ${place}` : what;
}

export function placeOf(r: Report, lang: Lang): string {
  return (lang === "en" && r.addressHintEn) || r.addressHint || "";
}

/** Higher = more urgent; pending review sorts first so it gets reviewed. */
export function priorityRank(r: Report): number {
  return r.priority ? { low: 1, medium: 2, high: 3, critical: 4 }[r.priority] : 5;
}

export function descriptionOf(r: Report, lang: Lang): string {
  return (lang === "en" && r.descriptionEn) || r.description;
}

/** Hours from creation to the first status change after "reported" (assignments don't count). */
export function firstResponseHours(r: Report): number | null {
  const ev = r.timeline.find((e) => e.type === "status" && e.from !== null);
  return ev ? (ev.at - r.createdAt) / 36e5 : null;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function resolvedAt(r: Report): number[] {
  return r.timeline.filter((e) => e.type === "status" && e.to === "resolved").map((e) => e.at);
}

export function summarize(reports: Report[], now: number, periodDays: number) {
  const since = now - periodDays * 864e5;
  const prevSince = since - periodDays * 864e5;
  const open = reports.filter(isOpen);
  const resolvedIn = (from: number, to: number) =>
    reports.filter((r) => resolvedAt(r).some((t) => t >= from && t < to)).length;
  const responses = (from: number, to: number) =>
    median(
      reports
        .filter((r) => r.createdAt >= from && r.createdAt < to)
        .map(firstResponseHours)
        .filter((h): h is number => h !== null),
    );
  return {
    open: open.length,
    awaiting: reports.filter((r) => r.status === "reported").length,
    working: reports.filter((r) => r.status === "investigating" || r.status === "in_progress").length,
    unassigned: open.filter((r) => !r.organizationId).length,
    resolved: resolvedIn(since, now + 1),
    resolvedPrev: resolvedIn(prevSince, since),
    medianResponse: responses(since, now + 1),
    medianResponsePrev: responses(prevSince, since),
    openOver14: open.filter((r) => now - r.createdAt > 14 * 864e5).length,
  };
}

/** Incoming and resolved per local day for the last `days` days. */
export function dailySeries(reports: Report[], now: number, days = 14) {
  const keys: string[] = [];
  const labels: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const ts = now - i * 864e5;
    keys.push(dayKey(ts));
    labels.push(ts);
  }
  const incoming = keys.map(() => 0);
  const resolved = keys.map(() => 0);
  for (const r of reports) {
    const ci = keys.indexOf(dayKey(r.createdAt));
    if (ci >= 0) incoming[ci]++;
    for (const t of resolvedAt(r)) {
      const ri = keys.indexOf(dayKey(t));
      if (ri >= 0) resolved[ri]++;
    }
  }
  return { labels, incoming, resolved };
}

/**
 * Age of open reports, in days. A bucket holds `minDays <= age < maxDays`. Shared with the SQL
 * version (src/server/queries/dashboard.ts) so both count the same way.
 */
export const AGE_BUCKETS = [
  { key: "lt2", mn: "2 хоногоос бага", en: "Under 2 days", minDays: -Infinity, maxDays: 2 },
  { key: "2-7", mn: "2–7 хоног", en: "2–7 days", minDays: 2, maxDays: 7 },
  { key: "7-14", mn: "7–14 хоног", en: "7–14 days", minDays: 7, maxDays: 14 },
  { key: "14-30", mn: "14–30 хоног", en: "14–30 days", minDays: 14, maxDays: 30 },
  { key: "gt30", mn: "30-аас дээш хоног", en: "Over 30 days", minDays: 30, maxDays: Infinity },
] as const;

export function ageBuckets(reports: Report[], now: number) {
  const open = reports.filter(isOpen);
  const d = (r: Report) => (now - r.createdAt) / 864e5;
  return AGE_BUCKETS.map(({ key, mn, en, minDays, maxDays }) => ({
    key,
    mn,
    en,
    value: open.filter((r) => d(r) >= minDays && d(r) < maxDays).length,
  }));
}
