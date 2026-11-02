"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { MapPinOff, Search, SlidersHorizontal, X } from "lucide-react";
import { Button, ButtonLink, IconButton } from "@/components/ui/button";
import { EmptyState, PageSkeleton, SampleDataPill } from "@/components/ui/feedback";
import { FilterChip, SegmentedControl, Select } from "@/components/ui/form";
import { Sheet } from "@/components/ui/overlay";
import { ReportCard } from "@/components/fixub/report-parts";
import { ReportMap } from "@/components/fixub/report-map";
import { useToast } from "@/components/ui/feedback";
import { cn } from "@/lib/cn";
import { summarize } from "@/lib/domain/metrics";
import { formatHours, formatNumber } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Catalog } from "@/lib/catalog";
import { DISTRICT_META, STATUS_META, STATUS_ORDER } from "@/lib/meta";
import { useNow, useStore } from "@/lib/store";
import type { CategorySlug, Report, ReportStatus } from "@/lib/types";

const DEFAULT_STATUSES: ReportStatus[] = ["reported", "investigating", "in_progress", "resolved"];

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
  const statuses = useMemo(() => {
    const raw = params.get("status");
    return raw ? (raw.split(",").filter((s) => s in STATUS_META) as ReportStatus[]) : DEFAULT_STATUSES;
  }, [params]);
  const category = (params.get("cat") ?? "all") as CategorySlug | "all";
  const subcategory = params.get("sub") ?? "all";
  const view = params.get("view") === "list" ? "list" : "map";
  const [q, setQ] = useState(params.get("q") ?? "");
  const deferredQ = useDeferredValue(q);
  const [selectedId, setSelectedId] = useState<string | null>(params.get("sel"));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [track, setTrack] = useState("");
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
        (r) =>
          (category === "all" || r.category === category) &&
          (subcategory === "all" || r.subcategory === subcategory) &&
          matchesQuery(r, deferredQ.trim(), catalog),
      ),
    [publicReports, category, subcategory, deferredQ, catalog],
  );
  const shown = useMemo(
    () => base.filter((r) => statuses.includes(r.status)).sort((a, b) => b.createdAt - a.createdAt),
    [base, statuses],
  );
  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<ReportStatus, number>;
    for (const r of base) c[r.status]++;
    return c;
  }, [base]);
  const stats = useMemo(() => summarize(publicReports, now, 30), [publicReports, now]);

  useEffect(() => {
    if (selectedId) listRefs.current.get(selectedId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  if (!ready) return <PageSkeleton />;

  const toggleStatus = (s: ReportStatus, on: boolean) => {
    const next = on ? STATUS_ORDER.filter((x) => x === s || statuses.includes(x)) : statuses.filter((x) => x !== s);
    const same = next.length === DEFAULT_STATUSES.length && next.every((x) => DEFAULT_STATUSES.includes(x));
    setParam({ status: same ? null : next.join(",") || "none" });
  };

  const onTrack = (e: React.FormEvent) => {
    e.preventDefault();
    const ref = track.trim().toUpperCase().replace(/\s/g, "");
    const hit = state.reports.find((r) => r.ref === ref || r.ref.endsWith(ref.replace(/^FX-?/, "")) && ref.length >= 4);
    if (hit && hit.visibility === "visible") router.push(`/reports/${hit.id}`);
    else setTrackError(t("Ийм дугаартай мэдээлэл олдсонгүй. Жишээ: FX-26-04101", "No report with that reference. Example: FX-26-04101"));
  };

  const filters = (
    <div className="flex flex-wrap items-center gap-2">
      {STATUS_ORDER.map((s) => (
        <FilterChip key={s} dot={s} selected={statuses.includes(s)} count={counts[s]} onToggle={(on) => toggleStatus(s, on)}>
          {pick(STATUS_META[s].label)}
        </FilterChip>
      ))}
      <Select
        label={t("Ангилал", "Category")}
        hideLabel
        size="sm"
        value={category}
        onChange={(v) => setParam({ cat: v === "all" ? null : v, sub: null })}
        options={[
          { value: "all", label: t("Бүх ангилал", "All categories") },
          ...catalog.list.map((c) => ({ value: c.id, label: pick(c.name) })),
        ]}
        className="w-56"
      />
      {category !== "all" && catalog.get(category) && (
        <Select
          label={t("Дэд ангилал", "Subcategory")}
          hideLabel
          size="sm"
          value={subcategory}
          onChange={(v) => setParam({ sub: v === "all" ? null : v })}
          options={[
            { value: "all", label: t("Бүх дэд ангилал", "All subcategories") },
            ...catalog.get(category)!.subcategories.map((x) => ({ value: x.id, label: pick(x.name) })),
          ]}
          className="w-64 max-w-full"
        />
      )}
    </div>
  );

  const list = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-small text-ink-muted">
        <span aria-live="polite">
          <b className="font-[650] text-ink tnum">{shown.length}</b> {t("мэдээлэл", shown.length === 1 ? "report" : "reports")}
        </span>
        <span>{t("Шинэ нь эхэндээ", "Newest first")}</span>
      </div>
      {shown.length === 0 ? (
        <EmptyState
          icon={MapPinOff}
          title={t("Тохирох мэдээлэл алга", "No reports match")}
          action={
            <Button
              onClick={() => {
                setQ("");
                router.replace("/", { scroll: false });
              }}
            >
              {t("Шүүлтүүрийг цэвэрлэх", "Clear filters")}
            </Button>
          }
        >
          {t("Эдгээр шүүлтүүрээр юу ч олдсонгүй. Асуудал харвал анхных нь болж мэдээлээрэй.", "Nothing here with these filters. If you see a problem, you can be the first to report it.")}
        </EmptyState>
      ) : (
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3" aria-label={t("Мэдээллийн жагсаалт", "Report list")}>
          {shown.map((r) => (
            <li key={r.id}>
              <ReportCard
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
  );

  return (
    <div className="mx-auto max-w-[1200px] px-4 pt-6 md:px-6 md:pt-8">
      {/* Intro + tracking */}
      <section className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-end">
        <div>
          <h1 className="max-w-[24ch] text-display font-[650] tracking-tight">
            {t("Хотын асуудлыг хамтдаа шийдье", "See and report problems on Ulaanbaatar’s streets")}
          </h1>
          <p className="mt-3 max-w-[60ch] text-body-lg text-ink-muted">
            {t(
              "Замын нүх, асахгүй гэрэл, дүүрсэн хогийн сав. Байршлаа тэмдэглэж, зураг нэмээд хариуцах байгууллагын явцыг олон нийтэд нээлттэй хянаарай.",
              "Potholes, broken lights, overflowing bins. Drop a pin, add a photo, and follow the responsible organization’s progress in public.",
            )}
          </p>
        </div>
        <form onSubmit={onTrack} className="lg:pb-1" noValidate>
          <label htmlFor="track" className="text-label font-[550]">
            {t("Мэдээллээ хянах", "Track a report")}
          </label>
          <div className="mt-1.5 flex gap-2">
            <div className="relative flex-1">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-subtle" />
              <input
                id="track"
                value={track}
                onChange={(e) => {
                  setTrack(e.target.value);
                  setTrackError("");
                }}
                placeholder="FX-26-04101"
                aria-invalid={!!trackError || undefined}
                aria-describedby={trackError ? "track-err" : undefined}
                className="h-10 w-full rounded-sm border border-line-strong bg-surface pl-10 pr-3 text-body tnum placeholder:text-ink-subtle [@media(pointer:coarse)]:h-11"
              />
            </div>
            <Button type="submit">{t("Хайх", "Find")}</Button>
          </div>
          {trackError && (
            <p id="track-err" role="alert" className="mt-1.5 text-small font-[550] text-danger">
              {trackError}
            </p>
          )}
        </form>
      </section>

      {/* City numbers: each explains itself */}
      <section aria-label={t("Хотын тоо баримт", "City numbers")} className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          { label: t("Нээлттэй мэдээлэл", "Open reports"), value: formatNumber(stats.open), def: t("Мэдээлэгдсэн, шалгаж буй эсвэл засварлаж буй", "Reported, investigating or in progress") },
          { label: t("Сүүлийн 30 хоногт шийдвэрлэсэн", "Resolved in the last 30 days"), value: formatNumber(stats.resolved), def: t("Байгууллага шийдвэрлэсэн гэж тэмдэглэсэн", "Marked resolved by an organization") },
          { label: t("Анхны хариу (медиан)", "Median first response"), value: formatHours(stats.medianResponse, lang), def: t("Мэдээлснээс анхны төлөв өөрчлөгдөх хүртэл, сүүлийн 30 хоног", "Reported → first status change, last 30 days") },
        ].map((k) => (
          <div key={k.label} className="rounded-md border border-line bg-surface p-4 shadow-xs">
            <p className="text-small text-ink-muted">{k.label}</p>
            <p className="mt-1 text-metric font-[650] tnum">{k.value}</p>
            <p className="mt-1 text-caption text-ink-subtle">{k.def}</p>
          </div>
        ))}
      </section>

      {/* Explorer */}
      <section className="mt-8" aria-labelledby="explorer-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="explorer-title" className="text-title-2 font-[600]">
            {t("Улаанбаатар дахь мэдээллүүд", "Reports in Ulaanbaatar")}
          </h2>
          <SampleDataPill />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-subtle" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label={t("Гарчиг, байршил, дүүргээр хайх", "Search by title, place or district")}
              placeholder={t("Жишээ: Энхтайваны өргөн чөлөө", "e.g. Peace Avenue")}
              className="h-10 w-full rounded-sm border border-line-strong bg-surface pl-10 pr-9 text-body placeholder:text-ink-subtle [@media(pointer:coarse)]:h-11"
            />
            {q && (
              <IconButton icon={X} label={t("Цэвэрлэх", "Clear")} size="sm" className="absolute right-1 top-1/2 -translate-y-1/2" onClick={() => setQ("")} />
            )}
          </div>
          <Button icon={SlidersHorizontal} className="md:hidden" onClick={() => setFiltersOpen(true)}>
            {t("Шүүлтүүр", "Filters")}
          </Button>
          <SegmentedControl
            className="md:hidden"
            label={t("Харагдац", "View")}
            value={view}
            onChange={(v) => setParam({ view: v === "list" ? "list" : null })}
            options={[
              { value: "map", label: t("Газрын зураг", "Map") },
              { value: "list", label: t("Жагсаалт", "List") },
            ]}
          />
        </div>
        <div className="mt-3 hidden md:block">{filters}</div>

        <div className="mt-3 overflow-hidden rounded-md border border-line bg-surface shadow-xs md:grid md:h-[600px] md:grid-cols-[1fr_340px] lg:grid-cols-[1fr_380px]">
          <div className={cn("relative h-[62dvh] min-h-[360px] md:h-full", view === "list" && "hidden md:block")}>
            <ReportMap
              className="h-full w-full"
              ariaLabel={t("Улаанбаатарын мэдээллийн газрын зураг", "Map of reports in Ulaanbaatar")}
              reports={shown}
              selectedId={selectedId}
              onSelect={(id) => setSelectedId(id)}
              detailHref={(id) => `/reports/${id}`}
              legendStatuses={statuses.length ? statuses : STATUS_ORDER}
              onLocateError={(m) => toast({ tone: "info", title: m })}
            />
          </div>
          <div className={cn("border-line md:h-full md:min-h-0 md:border-l", view === "map" && "hidden md:block", view === "list" && "min-h-[50dvh]")}>
            {list}
          </div>
        </div>
        <p className="mt-2 text-caption text-ink-subtle">
          {t(
            "Газрын зураг: © OpenStreetMap-ийн хувь нэмэр оруулагчид, OpenFreeMap. Хаагдсан мэдээллүүд анхдагчаар нуугдана.",
            "Map: © OpenStreetMap contributors, OpenFreeMap. Closed reports are hidden by default.",
          )}
        </p>
      </section>

      <section className="my-12 grid gap-4 rounded-md border border-line bg-surface p-5 md:grid-cols-[1fr_auto] md:items-center md:p-6">
        <div>
          <h2 className="text-title-3 font-[600]">{t("Хэрхэн ажилладаг вэ", "How it works")}</h2>
          <ol className="mt-2 grid gap-2 text-small text-ink-muted sm:grid-cols-3">
            <li>
              <b className="text-ink">1. {t("Мэдээлэх", "Report")}</b> — {t("байршил, ангилал, зураг", "location, category, photo")}
            </li>
            <li>
              <b className="text-ink">2. {t("Хуваарилах", "Assign")}</b> — {t("FixUB баг хариуцагчид шилжүүлнэ", "the FixUB team routes it to an organization")}
            </li>
            <li>
              <b className="text-ink">3. {t("Хянах", "Track")}</b> — {t("явц нь олон нийтэд нээлттэй", "progress is public")}
            </li>
          </ol>
        </div>
        <ButtonLink href="/reports/new" variant="primary" size="lg">
          {t("Асуудал мэдээлэх", "Report a problem")}
        </ButtonLink>
      </section>

      <Sheet
        open={filtersOpen}
        title={t("Шүүлтүүр", "Filters")}
        onClose={() => setFiltersOpen(false)}
        footer={
          <Button variant="primary" fullWidth onClick={() => setFiltersOpen(false)}>
            {t(`${shown.length} мэдээлэл харах`, `Show ${shown.length} reports`)}
          </Button>
        }
      >
        {filters}
      </Sheet>
    </div>
  );
}
