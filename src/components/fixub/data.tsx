"use client";

import Link from "next/link";
import { useId, useState } from "react";
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  CircleDot,
  Flag,
  EyeOff,
  Eye,
  TriangleAlert,
  Gauge,
  Users,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { placeOf } from "@/lib/domain/metrics";
import { ageDays, ageShort, formatDate, formatDateTime, formatTime } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Catalog } from "@/lib/catalog";
import { priorityRank } from "@/lib/domain/metrics";
import { DISTRICT_META, LIMITS, PRIORITY_META, STATUS_META } from "@/lib/meta";
import { useStore } from "@/lib/store";
import type { ActivityEvent, AppState, Report } from "@/lib/types";
import { CategoryTag, PriorityBadge, StatusBadge } from "./status";

/* ---------- KpiCard ---------- */

export function KpiCard({
  label,
  value,
  definition,
  icon: Icon,
  delta,
  attention,
  unavailable,
  fresh,
  href,
}: {
  label: string;
  value: string | number | null;
  definition: string;
  icon?: LucideIcon;
  delta?: { text: string; good: boolean | null; direction: "up" | "down" | "flat"; comparison: string };
  attention?: boolean;
  unavailable?: string;
  fresh?: boolean;
  href?: string;
}) {
  const body = (
    <>
      <p className="flex items-start gap-1.5 text-small font-[550] text-ink-muted">
        {Icon && <Icon aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />}
        {label}
      </p>
      {value === null ? (
        <p className="mt-2 text-label font-[600] text-ink-muted">— {unavailable}</p>
      ) : (
        <p className="mt-1 text-metric-xl font-[650] tnum">{value}</p>
      )}
      {delta && (
        <p className="mt-1 text-caption text-ink-subtle">
          <span
            className={cn(
              "mr-1 inline-flex items-center font-[650] tnum",
              delta.good === true && "text-success",
              delta.good === false && "text-danger",
            )}
          >
            {delta.direction === "up" && <ArrowUp aria-hidden className="size-3.5" strokeWidth={2.25} />}
            {delta.direction === "down" && <ArrowDown aria-hidden className="size-3.5" strokeWidth={2.25} />}
            {delta.text}
          </span>
          {delta.comparison}
        </p>
      )}
      <p className="mt-auto pt-3 text-caption text-ink-subtle">{definition}</p>
    </>
  );
  const cls = cn(
    "flex min-w-[136px] flex-col rounded-md border bg-surface p-4 shadow-xs",
    attention ? "border-st-investigating" : "border-line",
    fresh && "fx-fresh",
    href && "transition-colors hover:border-line-strong",
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/* ---------- ActivityFeed ---------- */

const eventIcon: Record<ActivityEvent["type"], LucideIcon> = {
  created: CircleDot,
  assigned: ArrowRight,
  status: CircleDot,
  confirmed: Users,
  disputed: TriangleAlert,
  flagged: Flag,
  hidden: EyeOff,
  restored: Eye,
  prioritized: Gauge,
};

export function activityText(ev: ActivityEvent, state: AppState, t: (mn: string, en: string) => string, pick: (b: { mn: string; en: string }) => string) {
  const report = state.reports.find((r) => r.id === ev.reportId);
  const cat = state.categories.find((c) => c.id === report?.category);
  const what = cat?.subcategories.find((x) => x.id === report?.subcategory)?.name ?? cat?.name ?? { mn: "", en: "" };
  switch (ev.type) {
    case "created":
      return t(`шинэ мэдээлэл: ${what.mn.toLowerCase()}`, `new report: ${what.en.toLowerCase()}`);
    case "prioritized":
      return ev.priority
        ? t(`ач холбогдол: ${PRIORITY_META[ev.priority].label.mn}`, `priority set to ${PRIORITY_META[ev.priority].label.en}`)
        : "";
    case "assigned": {
      const org = state.organizations.find((o) => o.id === ev.organizationId);
      return t(`хариуцагч: ${org ? org.name.mn : "—"}`, `assigned to ${org ? org.name.en : "—"}`);
    }
    case "status":
      if (ev.to === "closed" && ev.reason === "duplicate") return t("давхардсан тул хаагдсан", "closed as duplicate");
      return t(`${STATUS_META[ev.to!].label.mn} болсон`, `moved to ${STATUS_META[ev.to!].label.en}`);
    case "confirmed":
      return t("“Надад ч бас” нэмэгдсэн", "“me too” added");
    case "disputed":
      return t("ихэнх нь засаагүй гэж хариулсан", "most people say still broken");
    case "flagged":
      return t("зохисгүй гэж мэдэгдсэн", "flagged for review");
    case "hidden":
      return t(`нуугдсан${ev.actorLabel ? ` · ${pick(ev.actorLabel)}` : ""}`, `hidden${ev.actorLabel ? ` · ${pick(ev.actorLabel)}` : ""}`);
    case "restored":
      return t("сэргээгдсэн", "restored");
  }
}

export function ActivityFeed({
  events,
  state,
  hrefFor,
  maxHeight = 420,
  fresh,
  now,
}: {
  now: number;
  events: ActivityEvent[];
  state: AppState;
  hrefFor: (reportId: string) => string;
  maxHeight?: number;
  fresh?: ReadonlySet<string>;
}) {
  const { lang, t, pick } = useT();
  if (!events.length)
    return <p className="px-5 py-8 text-center text-small text-ink-muted">{t("Энэ хугацаанд үйл явдал алга.", "Nothing in this period.")}</p>;
  return (
    <ul className="divide-y divide-line overflow-y-auto" style={{ maxHeight }}>
      {events.map((ev) => {
        const report = state.reports.find((r) => r.id === ev.reportId);
        if (!report) return null;
        const Icon = ev.type === "status" && ev.to ? STATUS_META[ev.to].icon : eventIcon[ev.type];
        const tone =
          ev.type === "disputed" || ev.type === "flagged"
            ? "bg-danger-soft text-danger"
            : ev.type === "status" && ev.to
              ? `bg-[var(--status-${STATUS_META[ev.to].cssKey}-soft)] text-[var(--status-${STATUS_META[ev.to].cssKey}-text)]`
              : "bg-surface-sunken text-ink-muted";
        return (
          <li key={ev.id} className={cn("flex items-start gap-3 px-4 py-3 md:px-5", fresh?.has(ev.reportId) && "fx-fresh")}>
            <span className={cn("grid size-7 shrink-0 place-items-center rounded-full", tone)}>
              <Icon aria-hidden className="size-4" strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-small">
                <Link href={hrefFor(report.id)} className="font-[650] text-brand tnum hover:underline">
                  {report.ref}
                </Link>{" "}
                {activityText(ev, state, t, pick)}
              </p>
              <p className="truncate text-caption text-ink-subtle">
                {placeOf(report, lang)} · {pick(DISTRICT_META[report.district].label)}
              </p>
            </div>
            <time className="shrink-0 text-caption text-ink-subtle tnum" title={formatDateTime(ev.at, lang)}>
              {now - ev.at < 864e5 ? formatTime(ev.at) : formatDate(ev.at, lang, false)}
            </time>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- TrendChart (hand-rolled SVG) ---------- */

export function TrendChart({
  labels,
  series,
  summary,
  height = 200,
}: {
  labels: number[];
  series: { id: string; label: string; color: string; values: number[] }[];
  summary: string;
  height?: number;
}) {
  const { lang, t } = useT();
  const [asTable, setAsTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const descId = useId();
  const W = 640;
  const H = height;
  const pad = { l: 28, r: 10, t: 10, b: 22 };
  const maxV = Math.max(4, ...series.flatMap((s) => s.values));
  const yMax = Math.ceil(maxV / 4) * 4;
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, labels.length - 1);
  const y = (v: number) => pad.t + (1 - v / yMax) * (H - pad.t - pad.b);
  const ticks = [0, yMax / 4, yMax / 2, (3 * yMax) / 4, yMax];

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-caption text-ink-muted">
        {series.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      {asTable ? (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-small tnum">
            <thead className="sticky top-0 bg-surface-sunken text-left text-caption text-ink-muted">
              <tr>
                <th className="px-3 py-2 font-[550]">{t("Өдөр", "Day")}</th>
                {series.map((s) => (
                  <th key={s.id} className="px-3 py-2 text-right font-[550]">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {labels.map((l, i) => (
                <tr key={l}>
                  <td className="px-3 py-1.5">{formatDate(l, lang, false)}</td>
                  {series.map((s) => (
                    <td key={s.id} className="px-3 py-1.5 text-right">
                      {s.values[i]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full overflow-visible"
            role="img"
            aria-describedby={descId}
            onMouseLeave={() => setHover(null)}
            onMouseMove={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              const px = ((e.clientX - box.left) / box.width) * W;
              const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (labels.length - 1));
              setHover(Math.max(0, Math.min(labels.length - 1, i)));
            }}
          >
            {ticks.map((tv) => (
              <g key={tv}>
                <line x1={pad.l} x2={W - pad.r} y1={y(tv)} y2={y(tv)} stroke="var(--line)" />
                <text x={pad.l - 6} y={y(tv) + 4} textAnchor="end" fontSize="12" fill="var(--ink-subtle)" className="tnum">
                  {tv}
                </text>
              </g>
            ))}
            {labels.map((l, i) =>
              i % 2 === 0 || i === labels.length - 1 ? (
                <text key={l} x={x(i)} y={H - 4} textAnchor="middle" fontSize="12" fill="var(--ink-subtle)">
                  {formatDate(l, lang, false)}
                </text>
              ) : null,
            )}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--line-strong)" strokeDasharray="3 3" />}
            {series.map((s) => (
              <g key={s.id}>
                <path
                  d={s.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2.25}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <circle cx={x(s.values.length - 1)} cy={y(s.values[s.values.length - 1])} r={3.5} fill={s.color} />
                {hover !== null && <circle cx={x(hover)} cy={y(s.values[hover])} r={4} fill="var(--surface)" stroke={s.color} strokeWidth={2} />}
              </g>
            ))}
          </svg>
          {hover !== null && (
            <div
              className="pointer-events-none absolute top-0 rounded-sm border border-line bg-surface-overlay px-2.5 py-1.5 text-caption shadow-md"
              style={{ left: `clamp(0px, calc(${(x(hover) / W) * 100}% - 60px), calc(100% - 130px))` }}
            >
              <p className="font-[600]">{formatDate(labels[hover], lang)}</p>
              {series.map((s) => (
                <p key={s.id} className="tnum text-ink-muted">
                  {s.label}: <b className="text-ink">{s.values[hover]}</b>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p id={descId} className="text-small text-ink-muted">
          {summary}
        </p>
        <button type="button" onClick={() => setAsTable((v) => !v)} className="text-small font-[600] text-brand hover:underline">
          {asTable ? t("График харуулах", "Show as chart") : t("Хүснэгтээр харах", "Show as table")}
        </button>
      </div>
    </div>
  );
}

/* ---------- BarList ---------- */

export function BarList({
  items,
  ariaLabel,
}: {
  items: { key: string; label: string; value: number; icon?: LucideIcon; color?: string }[];
  ariaLabel: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul aria-label={ariaLabel} className="space-y-2.5">
      {items.map((it) => (
        <li key={it.key} className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-3 text-small">
          <span className="flex min-w-0 items-center gap-1.5 text-ink">
            {it.icon && <it.icon aria-hidden className="size-4 shrink-0 text-ink-muted" strokeWidth={2} />}
            <span className="truncate">{it.label}</span>
          </span>
          <span aria-hidden className="h-2 overflow-hidden rounded-xs bg-surface-sunken">
            <span
              className="block h-full rounded-xs transition-[width] duration-[260ms]"
              style={{ width: `${(it.value / max) * 100}%`, background: it.color ?? "var(--brand)" }}
            />
          </span>
          <span className="text-right font-[600] tnum">{it.value}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---------- ReportTable ---------- */

function SortHeader({
  k,
  sort,
  onSort,
  className,
  children,
}: {
  k: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (key: SortKey) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const active = sort.key === k;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("px-3 py-2.5 font-[550]", className)}
    >
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 hover:text-ink">
        {children}
        {active ? (
          sort.dir === "asc" ? (
            <ArrowUp aria-hidden className="size-3.5" />
          ) : (
            <ArrowDown aria-hidden className="size-3.5" />
          )
        ) : (
          <ArrowDownUp aria-hidden className="size-3.5 opacity-50" />
        )}
      </button>
    </th>
  );
}

export type SortKey = "ref" | "category" | "district" | "status" | "priority" | "age" | "metoo";

export function ReportTable({
  rows,
  state,
  now,
  sort,
  onSort,
  hrefFor,
  fresh,
  caption,
  showAssignee = true,
}: {
  rows: Report[];
  state: AppState;
  now: number;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (key: SortKey) => void;
  hrefFor: (id: string) => string;
  fresh?: ReadonlySet<string>;
  caption: string;
  showAssignee?: boolean;
}) {
  const { lang, t, pick } = useT();
  const { catalog } = useStore();
  const assignee = (r: Report) => {
    const org = state.organizations.find((o) => o.id === r.organizationId);
    if (!org) return null;
    const unit = org.units.find((u) => u.id === r.unitId);
    return unit ? pick(unit.name) : pick(org.name);
  };
  const ageCls = (r: Report) => {
    if (r.status === "resolved" || r.status === "closed") return "text-ink-muted";
    const d = ageDays(r.createdAt, now);
    return d > LIMITS.ageDangerDays ? "font-[650] text-danger" : d > LIMITS.ageWarnDays ? "font-[650] text-warning" : "";
  };
  return (
    <div className="@container">
      {/* Wide: table. Narrow (<720px container): stacked cards with the same data and order. */}
      <table className="hidden w-full text-left text-small @[720px]:table">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-10 bg-surface-sunken text-caption text-ink-muted">
          <tr>
            <SortHeader sort={sort} onSort={onSort} k="ref">{t("Дугаар", "Report")}</SortHeader>
            <SortHeader sort={sort} onSort={onSort} k="category">{t("Асуудал", "Problem")}</SortHeader>
            <SortHeader sort={sort} onSort={onSort} k="district">{t("Байршил", "Location")}</SortHeader>
            <SortHeader sort={sort} onSort={onSort} k="status">{t("Төлөв", "Status")}</SortHeader>
            <SortHeader sort={sort} onSort={onSort} k="priority">{t("Ач холбогдол", "Priority")}</SortHeader>
            <SortHeader sort={sort} onSort={onSort} k="age">{t("Хугацаа", "Age")}</SortHeader>
            <SortHeader sort={sort} onSort={onSort} k="metoo" className="text-right">
              {t("Бас", "Me too")}
            </SortHeader>
            {showAssignee && (
              <th scope="col" className="px-3 py-2.5 font-[550]">
                {t("Хариуцагч", "Assigned")}
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr
              key={r.id}
              className={cn(
                "group relative hover:bg-surface-sunken/60",
                // A thin edge marks critical/high work without shouting.
                r.priority === "critical" && "shadow-[inset_3px_0_0_var(--danger-fill)]",
                r.priority === "high" && "shadow-[inset_3px_0_0_var(--danger-soft)]",
                fresh?.has(r.id) && "fx-fresh",
              )}
            >
              <td className="px-3 py-2.5 align-top">
                <Link
                  href={hrefFor(r.id)}
                  className="font-[650] text-brand tnum after:absolute after:inset-0 hover:underline focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-[var(--focus)] focus-visible:after:-outline-offset-2"
                >
                  {r.ref}
                </Link>
                {r.visibility === "hidden" && (
                  <span className="mt-1 flex items-center gap-1 text-caption text-danger">
                    <EyeOff aria-hidden className="size-3.5" /> {t("Нуусан", "Hidden")}
                  </span>
                )}
              </td>
              <td className="max-w-[16rem] px-3 py-2.5 align-top">
                <p className="line-clamp-2 font-[550] text-ink">{catalog.subLabel(r.category, r.subcategory, lang)}</p>
                <CategoryTag category={r.category} />
              </td>
              <td className="max-w-[14rem] px-3 py-2.5 align-top">
                <p className="line-clamp-1 font-[500]">{placeOf(r, lang)}</p>
                <p className="text-caption text-ink-subtle">{pick(DISTRICT_META[r.district].label)}</p>
              </td>
              <td className="px-3 py-2.5 align-top">
                <StatusBadge status={r.status} reason={r.closureReason} />
              </td>
              <td className="px-3 py-2.5 align-top">
                <PriorityBadge priority={r.priority} />
              </td>
              <td className={cn("px-3 py-2.5 align-top tnum", ageCls(r))} title={formatDateTime(r.createdAt, lang)}>
                {ageShort(r.createdAt, now, lang)}
                              {r.dueAt && now > r.dueAt && <span className="mt-0.5 block text-caption font-[650] text-danger">{t("Хугацаа хэтэрсэн", "Overdue")}</span>}
              </td>
              <td className="px-3 py-2.5 text-right align-top font-[600] tnum">{r.confirmations.length}</td>
              {showAssignee && (
                <td className="px-3 py-2.5 align-top text-caption">
                  {assignee(r) ?? <span className="font-[600] text-warning">{t("Хуваарилаагүй", "Unassigned")}</span>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="divide-y divide-line @[720px]:hidden">
        {rows.map((r) => (
          <li key={r.id} className={cn(fresh?.has(r.id) && "fx-fresh")}>
            <Link href={hrefFor(r.id)} className="block px-4 py-3 hover:bg-surface-sunken/60">
              <span className="flex flex-wrap items-center gap-2">
                <span className="mr-auto font-[650] text-brand tnum">{r.ref}</span>
                <StatusBadge status={r.status} reason={r.closureReason} />
                <PriorityBadge priority={r.priority} />
              </span>
              <span className="mt-1 block text-label font-[600]">
                {catalog.subLabel(r.category, r.subcategory, lang)}
                {placeOf(r, lang) && ` · ${placeOf(r, lang)}`}
              </span>
              <CategoryTag category={r.category} className="mt-0.5" />
              <span className="mt-0.5 flex flex-wrap gap-x-3 text-caption text-ink-subtle">
                <span>{pick(DISTRICT_META[r.district].label)}</span>
                <span className={cn("tnum", ageCls(r))}>{ageShort(r.createdAt, now, lang)}</span>
                <span className="tnum">
                  {r.confirmations.length} {t("бас", "me too")}
                </span>
                {showAssignee && <span>{assignee(r) ?? t("Хуваарилаагүй", "Unassigned")}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function sortReports(rows: Report[], sort: { key: SortKey; dir: "asc" | "desc" }, lang: "mn" | "en", catalog: Catalog) {
  const order = ["reported", "investigating", "in_progress", "resolved", "closed"];
  const val = (r: Report): string | number => {
    switch (sort.key) {
      case "ref":
        return r.ref;
      case "category":
        return `${catalog.label(r.category, lang)} ${catalog.subLabel(r.category, r.subcategory, lang)}`;
      case "priority":
        return priorityRank(r); // "desc" lists pending review first, then critical → low
      case "district":
        return DISTRICT_META[r.district].label[lang];
      case "status":
        return order.indexOf(r.status);
      case "age":
        return -r.createdAt; // grows with age: "desc" lists the oldest first
      case "metoo":
        return r.confirmations.length;
    }
  };
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const A = val(a);
    const B = val(b);
    // Ties fall back to oldest first, so equal-priority work keeps a stable, fair order.
    return (A < B ? -1 : A > B ? 1 : 0) * dir || a.createdAt - b.createdAt;
  });
}
