"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { MapPinOff, Search, X } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { EmptyState, PageSkeleton, SampleDataPill, useToast } from "@/components/ui/feedback";
import { ReportRow } from "@/components/fixub/report-parts";
import { ReportMap } from "@/components/fixub/report-map";
import { Photo } from "@/components/fixub/photo";
import { cn } from "@/lib/cn";
import { reportTitle, resolvedAt, summarize } from "@/lib/domain/metrics";
import { formatHours } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Catalog } from "@/lib/catalog";
import { DISTRICT_META, ICONS, OPEN_STATUSES } from "@/lib/meta";
import { fetchApi } from "@/lib/api/hooks";
import type { ReportsResponse } from "@/lib/api/types";
import { useNow, useStore } from "@/lib/store";
import type { CategorySlug, Report, ReportStatus, StatusTimelineEvent } from "@/lib/types";

/** What the phone shows first: open problems, the fixed ones, or both. */
type Tab = "open" | "fixed" | "all";
const TAB_STATUSES: Record<Tab, ReportStatus[]> = {
  open: OPEN_STATUSES,
  fixed: ["resolved"],
  all: [...OPEN_STATUSES, "resolved"],
};
const REF_LIKE = /^FX-?\d{2}-?\d{4,}$/i;
const hideScrollbar = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export function matchesQuery(r: Report, q: string, catalog: Catalog) {
  if (!q) return true;
  const cat = catalog.get(r.category);
  const sub = catalog.sub(r.category, r.subcategory);
  const hay = [
    r.ref,
    r.addressHint,
    r.addressHintEn,
    r.description,
    r.descriptionEn,
    cat?.name.mn,
    cat?.name.en,
    sub?.name.mn,
    sub?.name.en,
    DISTRICT_META[r.district].label.mn,
    DISTRICT_META[r.district].label.en,
  ]
    .join(" ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

export function HomeExplorer() {
  const { ready, state, freshIds, catalog } = useStore();
  const { lang, t, pick } = useT();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const now = useNow();

  // Filters live in the URL so views can be shared (FR-002).
  const tab: Tab = params.get("tab") === "fixed" ? "fixed" : params.get("tab") === "all" ? "all" : "open";
  const category = (params.get("cat") ?? "all") as CategorySlug | "all";
  const [q, setQ] = useState(params.get("q") ?? "");
  const deferredQ = useDeferredValue(q);
  const [selectedId, setSelectedId] = useState<string | null>(params.get("sel"));
  const [trackError, setTrackError] = useState("");
  const listRefs = useRef(new Map<string, HTMLButtonElement>());

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const s = next.toString();
    router.replace(s ? `/?${s}` : "/", { scroll: false });
  };

  useEffect(() => {
    const id = setTimeout(() => {
      if ((params.get("q") ?? "") !== deferredQ) setParam({ q: deferredQ || null });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredQ]);

  const publicReports = useMemo(() => state.reports.filter((r) => r.visibility === "visible"), [state.reports]);
  const base = useMemo(
    () =>
      publicReports.filter(
        (r) => (category === "all" || r.category === category) && matchesQuery(r, deferredQ.trim(), catalog),
      ),
    [publicReports, category, deferredQ, catalog],
  );
  const statuses = TAB_STATUSES[tab];
  const shown = useMemo(
    () => base.filter((r) => statuses.includes(r.status)).sort((a, b) => b.createdAt - a.createdAt),
    [base, statuses],
  );
  const counts = useMemo(() => {
    const n = (list: ReportStatus[]) => base.filter((r) => list.includes(r.status)).length;
    return { open: n(TAB_STATUSES.open), fixed: n(TAB_STATUSES.fixed), all: n(TAB_STATUSES.all) };
  }, [base]);
  const stats = useMemo(() => summarize(publicReports, now, 30), [publicReports, now]);
  const recentlyFixed = useMemo(
    () =>
      publicReports
        .filter((r) => r.status === "resolved")
        .map((r) => ({ r, at: Math.max(0, ...resolvedAt(r)) }))
        .filter((x) => x.at > 0)
        .sort((a, b) => b.at - a.at)
        .slice(0, 4),
    [publicReports],
  );

  // Keep the selected row in view inside the desktop list. On a phone the page itself scrolls, so leave it be.
  useEffect(() => {
    if (selectedId && window.matchMedia("(min-width: 768px)").matches) {
      listRefs.current.get(selectedId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedId]);

  if (!ready) return <PageSkeleton />;

  // One field for both jobs: a reference number opens that report, anything else narrows the map and list.
  const onSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const ref = q.trim().toUpperCase().replace(/\s/g, "");
    if (!REF_LIKE.test(ref)) return;
    let hit = state.reports.find((r) => r.ref === ref || (r.ref.endsWith(ref.replace(/^FX-?/, "")) && ref.length >= 4));
    // Not among the recent ones on this page: ask the server for that exact reference.
    if (!hit && /^FX-\d{2}-\d{5,}$/.test(ref)) {
      hit = (await fetchApi<ReportsResponse>(`/api/v1/reports?ref=${ref}`).catch(() => null))?.reports[0];
    }
    if (hit && hit.visibility === "visible") router.push(`/reports/${hit.id}`);
    else setTrackError(t("Ийм дугаартай мэдээлэл олдсонгүй. Жишээ: FX-26-04101", "No report with that number. Example: FX-26-04101"));
  };

  const clearAll = () => {
    setQ("");
    router.replace("/", { scroll: false });
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "open", label: t("Нээлттэй", "Open") },
    { id: "fixed", label: t("Засагдсан", "Fixed") },
    { id: "all", label: t("Бүгд", "All") },
  ];

  return (
    <div className="mx-auto max-w-[1120px] px-4 md:px-6">
      {/* Numbers first, then one search field */}
      <section className="pt-5 md:grid md:grid-cols-[1.2fr_1fr] md:items-end md:gap-10 md:pt-9" aria-labelledby="home-title">
        <div>
          <h1 id="home-title" className="text-[28px] font-[700] leading-[34px] tracking-tight md:text-display">
            <span className="text-brand tnum">{stats.open}</span> {t("нээлттэй", "open")} ·{" "}
            <span className="text-[var(--status-resolved-text)] tnum">{stats.resolved}</span> {t("засагдсан", "fixed")}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-ink-subtle">
            <span>
              {t("Сүүлийн 30 хоног", "Last 30 days")}
              {stats.medianResponse !== null && ` · ${t("анхны хариу", "first reply in")} ${formatHours(stats.medianResponse, lang)}`}
            </span>
            <SampleDataPill />
          </p>
        </div>
        <form onSubmit={onSearch} className="mt-3.5 md:mt-0" noValidate role="search">
          <label htmlFor="home-search" className="sr-only">
            {t("Гудамж, дүүрэг эсвэл мэдээллийн дугаараар хайх", "Search by street, district or report number")}
          </label>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-subtle" />
            <input
              id="home-search"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setTrackError("");
              }}
              placeholder={t("Гудамж, дүүрэг эсвэл дугаар", "Street, district or report number")}
              aria-invalid={!!trackError || undefined}
              aria-describedby={trackError ? "search-err" : undefined}
              className="h-[52px] w-full rounded-md border border-line-strong bg-surface pl-11 pr-11 text-body placeholder:text-ink-subtle"
            />
            {q && (
              <IconButton
                icon={X}
                label={t("Цэвэрлэх", "Clear")}
                className="absolute right-1 top-1/2 -translate-y-1/2"
                onClick={() => {
                  setQ("");
                  setTrackError("");
                }}
              />
            )}
          </div>
          {trackError && (
            <p id="search-err" role="alert" className="mt-1.5 text-small font-[550] text-danger">
              {trackError}
            </p>
          )}
        </form>
      </section>

      <section className="mt-3" aria-label={t("Улаанбаатар дахь мэдээллүүд", "Reports in Ulaanbaatar")}>
        <div role="group" aria-label={t("Төлвөөр шүүх", "Filter by status")} className="grid grid-cols-3 gap-1 rounded-md bg-surface-sunken p-1">
          {tabs.map((x) => (
            <button
              key={x.id}
              type="button"
              aria-pressed={tab === x.id}
              onClick={() => setParam({ tab: x.id === "open" ? null : x.id })}
              className={cn(
                "flex min-h-12 items-center justify-center gap-1.5 rounded-sm text-label font-[600] transition-colors duration-[140ms]",
                tab === x.id ? "bg-surface text-ink shadow-xs" : "text-ink-muted hover:text-ink",
              )}
            >
              {x.label}
              <span className="font-[500] text-ink-subtle tnum">{counts[x.id]}</span>
            </button>
          ))}
        </div>

        <div role="group" aria-label={t("Ангилалаар шүүх", "Filter by category")} className={cn("mt-2.5 flex gap-2 overflow-x-auto pb-1.5", hideScrollbar)}>
          {[{ id: "all", label: t("Бүх ангилал", "All types"), Icon: ICONS.ellipsis }, ...catalog.list.map((c) => ({ id: c.id, label: pick(c.name), Icon: ICONS[c.icon] ?? ICONS.ellipsis }))].map(
            ({ id, label, Icon }) => {
              const on = category === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setParam({ cat: id === "all" ? null : id })}
                  className={cn(
                    "inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-body font-[500] whitespace-nowrap transition-colors duration-[140ms]",
                    on ? "border-transparent bg-brand-soft font-[600] text-brand" : "border-line bg-surface text-ink-muted hover:text-ink",
                  )}
                >
                  <Icon aria-hidden className="size-[18px]" strokeWidth={1.75} />
                  {label}
                </button>
              );
            },
          )}
        </div>

        <div className="mt-2 overflow-hidden rounded-lg border border-line bg-surface shadow-xs md:grid md:h-[640px] md:grid-cols-[1fr_380px]">
          <div className="relative h-[46dvh] min-h-[320px] md:h-full">
            <ReportMap
              className="h-full w-full"
              ariaLabel={t("Улаанбаатарын мэдээллийн газрын зураг", "Map of reports in Ulaanbaatar")}
              reports={shown}
              selectedId={selectedId}
              onSelect={(id) => setSelectedId(id)}
              detailHref={(id) => `/reports/${id}`}
              legendStatuses={statuses}
              onLocateError={(m) => toast({ tone: "info", title: m })}
              compact
            />
          </div>
          <div className="border-t border-line md:flex md:h-full md:min-h-0 md:flex-col md:border-l md:border-t-0">
            <p className="px-4 py-3 text-small text-ink-subtle" aria-live="polite">
              <b className="font-[600] text-ink tnum">{shown.length}</b> {t("мэдээлэл", shown.length === 1 ? "report" : "reports")}
            </p>
            {shown.length === 0 ? (
              <EmptyState
                icon={MapPinOff}
                title={t("Тохирох мэдээлэл алга", "No reports match")}
                action={<Button onClick={clearAll}>{t("Шүүлтүүрийг цэвэрлэх", "Clear filters")}</Button>}
              >
                {t("Асуудал харвал анхных нь болж мэдээлээрэй.", "If you see a problem, you can be the first to report it.")}
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line border-t border-line md:min-h-0 md:flex-1 md:overflow-y-auto" aria-label={t("Мэдээллийн жагсаалт", "Report list")}>
                {shown.map((r) => (
                  <li key={r.id}>
                    <ReportRow
                      ref={(el) => {
                        if (el) listRefs.current.set(r.id, el);
                        else listRefs.current.delete(r.id);
                      }}
                      report={r}
                      now={now}
                      selected={r.id === selectedId}
                      fresh={freshIds.has(r.id)}
                      onOpen={(id) => router.push(`/reports/${id}`)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <p className="mt-2 text-caption text-ink-subtle">
          {t("Газрын зураг: © OpenStreetMap-ийн хувь нэмэр оруулагчид, OpenFreeMap.", "Map: © OpenStreetMap contributors, OpenFreeMap.")}
        </p>
      </section>

      {recentlyFixed.length > 0 && (
        <section className="mb-10 mt-8" aria-labelledby="fixed-title">
          <h2 id="fixed-title" className="text-title-3 font-[700]">
            {t("Сүүлд засагдсан", "Recently fixed")}
          </h2>
          <ul className={cn("-mx-4 mt-2.5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0", hideScrollbar)}>
            {recentlyFixed.map(({ r, at }) => (
              <li key={r.id} className="w-[78%] max-w-[300px] shrink-0 snap-start">
                <FixedCard report={r} fixedAt={at} catalog={catalog} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Before and after side by side, the title and how long the fix took. */
function FixedCard({ report, fixedAt, catalog }: { report: Report; fixedAt: number; catalog: Catalog }) {
  const { lang, t } = useT();
  const after = (report.timeline.filter((e): e is StatusTimelineEvent => e.type === "status" && e.to === "resolved" && !!e.photoId).pop())?.photoId;
  const before = report.photoIds[0];
  const days = Math.max(1, Math.round((fixedAt - report.createdAt) / 864e5));
  const tile = "aspect-[4/3] w-full";
  return (
    <Link href={`/reports/${report.id}`} className="block overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
      <div className="grid grid-cols-2 gap-0.5">
        {before ? <Photo id={before} alt={t("Өмнө", "Before")} category={report.category} className={tile} /> : <div className={cn(tile, "bg-surface-sunken")} />}
        {after ? <Photo id={after} alt={t("Дараа", "After")} category={report.category} className={tile} /> : <div className={cn(tile, "bg-surface-sunken")} />}
      </div>
      <div className="px-3.5 pb-3.5 pt-3">
        <p className="line-clamp-2 text-label font-[600] leading-snug">{reportTitle(report, lang, catalog)}</p>
        <p className="mt-0.5 text-small font-[500] text-[var(--status-resolved-text)]">
          {t(`${days} хоногт засагдсан`, `Fixed in ${days} ${days === 1 ? "day" : "days"}`)}
        </p>
      </div>
    </Link>
  );
}
