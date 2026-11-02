import type { Lang } from "./types";

const TZ = "Asia/Ulaanbaatar";
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(ts: number) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return {
    y: Number(p.year),
    m: Number(p.month),
    d: Number(p.day),
    hh: p.hour === "24" ? "00" : p.hour,
    mm: p.minute,
  };
}

/** "14:32" in Asia/Ulaanbaatar. */
export function formatTime(ts: number): string {
  const p = parts(ts);
  return `${p.hh}:${p.mm}`;
}

/** "19 Oct 2026" / "2026.10.19". */
export function formatDate(ts: number, lang: Lang, withYear = true): string {
  const p = parts(ts);
  if (lang === "mn") return withYear ? `${p.y}.${String(p.m).padStart(2, "0")}.${String(p.d).padStart(2, "0")}` : `${p.m}-р сарын ${p.d}`;
  return withYear ? `${p.d} ${MONTHS_EN[p.m - 1]} ${p.y}` : `${p.d} ${MONTHS_EN[p.m - 1]}`;
}

export function formatDateTime(ts: number, lang: Lang): string {
  return `${formatDate(ts, lang, false)}, ${formatTime(ts)}`;
}

/** Local day key (YYYY-MM-DD) in Asia/Ulaanbaatar. */
export function dayKey(ts: number): string {
  const p = parts(ts);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export function timeAgo(ts: number, now: number, lang: Lang): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  const mn = lang === "mn";
  if (s < 60) return mn ? "дөнгөж сая" : "just now";
  const m = Math.round(s / 60);
  if (m < 60) return mn ? `${m} мин өмнө` : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return mn ? `${h} цагийн өмнө` : `${h} h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return mn ? "өчигдөр" : "yesterday";
  return mn ? `${d} хоногийн өмнө` : `${d} days ago`;
}

/** Compact age for tables: "13 d", "5 h". */
export function ageShort(ts: number, now: number, lang: Lang): string {
  const h = Math.max(0, (now - ts) / 36e5);
  const mn = lang === "mn";
  if (h < 1) return mn ? `${Math.max(1, Math.round(h * 60))} мин` : `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 24) return mn ? `${Math.round(h)} цаг` : `${Math.round(h)} h`;
  const d = Math.floor(h / 24);
  return mn ? `${d} хон` : `${d} d`;
}

export function ageDays(ts: number, now: number): number {
  return (now - ts) / 864e5;
}

/** "1 d 7 h" style duration from hours. */
export function formatHours(hours: number | null, lang: Lang): string {
  if (hours === null || !Number.isFinite(hours)) return "—";
  const mn = lang === "mn";
  if (hours < 1) return mn ? `${Math.round(hours * 60)} мин` : `${Math.round(hours * 60)} min`;
  const d = Math.floor(hours / 24);
  const h = Math.round(hours - d * 24);
  if (d === 0) return mn ? `${h} цаг` : `${h} h`;
  return mn ? `${d} хон ${h} цаг` : `${d} d ${h} h`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatDistance(m: number, lang: Lang): string {
  return lang === "mn" ? `${Math.round(m)} м` : `${Math.round(m)} m`;
}
