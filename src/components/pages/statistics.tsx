"use client";

import { useMemo, useState } from "react";
import { CircleCheck, Clock, Inbox, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Banner, PageSkeleton, SampleDataPill } from "@/components/ui/feedback";
import { SegmentedControl } from "@/components/ui/form";
import { Card } from "@/components/ui/overlay";
import { BarList, KpiCard, TrendChart } from "@/components/fixub/data";
import { StatusDot } from "@/components/fixub/status";
import { useLiveApi } from "@/lib/api/hooks";
import type { StatisticsResponse } from "@/lib/api/types";
import { ageBuckets, dailySeries, isOpen, summarize } from "@/lib/domain/metrics";
import { formatHours } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { DISTRICT_META, DISTRICT_ORDER, STATUS_META, STATUS_ORDER } from "@/lib/meta";
import { useNow, useStore } from "@/lib/store";
import type { DistrictId, Report, ReportStatus } from "@/lib/types";

/** What the page shows: the same whether it was counted by the server or by the browser-only demo. */
interface View {
  open: number;
  resolved: number;
  resolvedPrev: number;
  medianResponse: number | null;
  openOver14: number;
  total: number;
  series: { labels: number[]; incoming: number[]; resolved: number[] };
  statusCounts: { st: ReportStatus; n: number }[];
  /** Open reports by category slug. */
  categoryCounts: Map<string, number>;
  districtCounts: Record<DistrictId, number>;
  ages: { key: string; mn: string; en: string; value: number }[];
}

const AGE_LABELS = [
  { key: "lt2", mn: "2 хоногоос бага", en: "Under 2 days" },
  { key: "2-7", mn: "2–7 хоног", en: "2–7 days" },
  { key: "7-14", mn: "7–14 хоног", en: "7–14 days" },
  { key: "14-30", mn: "14–30 хоног", en: "14–30 days" },
  { key: "gt30", mn: "30-аас дээш хоног", en: "Over 30 days" },
] as const;

/** The server's numbers (GET /api/v1/statistics, counted in SQL). */
function fromServer(d: StatisticsResponse): View {
  return {
    open: d.open,
    resolved: d.resolved,
    resolvedPrev: d.resolvedPrev,
    medianResponse: d.medianResponseHours,
    openOver14: d.openOver14,
    total: d.total,
    series: d.series,
    statusCounts: STATUS_ORDER.map((st) => ({ st, n: d.byStatus[st] ?? 0 })),
    categoryCounts: new Map(d.openByCategory.map((c) => [c.category, c.count])),
    districtCounts: d.openByDistrict,
    ages: AGE_LABELS.map((l) => ({ ...l, value: d.openByAge[l.key] })),
  };
}

/** The browser-only demo has no server: it counts its own reports. */
function fromDemo(visible: Report[], now: number, days: number): View {
  const s = summarize(visible, now, days);
  const open = visible.filter(isOpen);
  const categoryCounts = new Map<string, number>();
  for (const r of open) categoryCounts.set(r.category, (categoryCounts.get(r.category) ?? 0) + 1);
  return {
    open: s.open,
    resolved: s.resolved,
    resolvedPrev: s.resolvedPrev,
    medianResponse: s.medianResponse,
    openOver14: s.openOver14,
    total: visible.length,
    series: dailySeries(visible, now, 14),
    statusCounts: STATUS_ORDER.map((st) => ({ st, n: visible.filter((r) => r.status === st).length })),
    categoryCounts,
    districtCounts: Object.fromEntries(DISTRICT_ORDER.map((d) => [d, open.filter((r) => r.district === d).length])) as Record<DistrictId, number>,
    ages: ageBuckets(visible, now),
  };
}

export function Statistics() {
  const { ready, state, catalog, server } = useStore();
  const { lang, t, pick } = useT();
  const now = useNow(60_000);
  const [period, setPeriod] = useState<"7" | "30" | "90">("30");
  const days = Number(period);
  // With a server the numbers are counted in SQL and re-read every 15 s; without one, in the browser.
  const live = useLiveApi<StatisticsResponse>(server.configured ? `/api/v1/statistics?days=${days}` : null);
  const view = useMemo<View | null>(() => {
    if (server.configured) return live.data ? fromServer(live.data) : null;
    return fromDemo(state.reports.filter((r) => r.visibility === "visible"), now, days);
  }, [server.configured, live.data, state.reports, now, days]);

  if (!ready || (server.configured && live.isLoading && !live.data)) return <PageSkeleton />;
  if (!view) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-6 md:py-10">
        <Banner
          tone="danger"
          title={t("Статистикийг ачаалж чадсангүй", "Couldn't load the statistics")}
          actions={<Button onClick={() => live.mutate()}>{t("Дахин оролдох", "Try again")}</Button>}
        >
          {live.error?.message}
        </Banner>
      </div>
    );
  }

  const { statusCounts, series, total: all } = view;
  const s = view;
  const total = all || 1;
  const inSum = series.incoming.reduce((a, b) => a + b, 0);
  const outSum = series.resolved.reduce((a, b) => a + b, 0);
  const periodLabel = t(`сүүлийн ${days} хоног`, `last ${days} days`);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-6 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-title-1 font-[650] tracking-tight">{t("Статистик", "Statistics")}</h1>
          <p className="mt-1 text-small text-ink-muted">
            {t("Улаанбаатар · олон нийтэд харагдах мэдээллүүд · цаг Asia/Ulaanbaatar", "Ulaanbaatar · public reports · times in Asia/Ulaanbaatar")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SampleDataPill />
          <SegmentedControl
            label={t("Хугацаа", "Period")}
            value={period}
            onChange={setPeriod}
            options={[
              { value: "7", label: t("7 хоног", "7 days") },
              { value: "30", label: t("30 хоног", "30 days") },
              { value: "90", label: t("90 хоног", "90 days") },
            ]}
          />
        </div>
      </div>
      <p className="mt-3 text-caption text-ink-subtle">
        {t("Хугацааны сонголт нь “Шийдвэрлэсэн” болон “Анхны хариу” үзүүлэлтэд хамаарна; бусад нь одоогийн байдал.", "The period applies to “Resolved” and “Median first response”; the other numbers are current.")}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard icon={Inbox} label={t("Нээлттэй", "Open reports")} value={s.open} definition={t("Мэдээлэгдсэн, шалгаж буй, засварлаж буй. Одоогийн тоо.", "Reported, investigating or in progress. Current count.")} />
        <KpiCard
          icon={CircleCheck}
          label={t(`Шийдвэрлэсэн · ${days} хоног`, `Resolved · ${days} days`)}
          value={s.resolved}
          definition={t("Энэ хугацаанд шийдвэрлэсэн төлөвт шилжсэн.", "Moved to Resolved in the period.")}
          delta={{
            text: `${s.resolved - s.resolvedPrev >= 0 ? "+" : "−"}${Math.abs(s.resolved - s.resolvedPrev)}`,
            direction: s.resolved > s.resolvedPrev ? "up" : s.resolved < s.resolvedPrev ? "down" : "flat",
            good: s.resolved === s.resolvedPrev ? null : s.resolved > s.resolvedPrev,
            comparison: t(" өмнөх ижил хугацаатай харьцуулахад", ` vs previous ${days} days`),
          }}
        />
        <KpiCard
          icon={Clock}
          label={t("Анхны хариу (медиан)", "Median first response")}
          value={s.medianResponse === null ? null : formatHours(s.medianResponse, lang)}
          unavailable={t("энэ хугацаанд хариу өгөгдөөгүй", "no responses in this period")}
          definition={t("Мэдээлснээс анхны төлөв өөрчлөгдөх хүртэл. Хүлээгдэж буйг тооцохгүй.", "Reported → first status change. Reports still waiting are excluded.")}
        />
        <KpiCard
          icon={TriangleAlert}
          label={t("14 хоногоос удсан", "Open > 14 days")}
          value={s.openOver14}
          attention={s.openOver14 > 0}
          definition={t("Хугацааны норм тогтоогоогүй тул “хоцорсон” гэж тооцохгүй.", "No deadlines are configured, so nothing is called “overdue”.")}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card title={t("Ирсэн ба шийдвэрлэсэн", "Incoming vs resolved")} subtitle={t("Өдөр бүр, сүүлийн 14 хоног · хүлээгдэж буй ажил өсөж байна уу?", "Per day, last 14 days · is the backlog growing?")}>
          <TrendChart
            labels={series.labels}
            series={[
              { id: "in", label: t("Ирсэн", "Incoming"), color: "var(--brand)", values: series.incoming },
              { id: "out", label: t("Шийдвэрлэсэн", "Resolved"), color: "var(--status-resolved)", values: series.resolved },
            ]}
            summary={t(
              `Ирсэн ${inSum}, шийдвэрлэсэн ${outSum} — хүлээгдэж буй ажил ${inSum >= outSum ? `${inSum - outSum}-аар өссөн` : `${outSum - inSum}-аар буурсан`}.`,
              `Incoming ${inSum}, resolved ${outSum} — backlog ${inSum >= outSum ? `grew by ${inSum - outSum}` : `shrank by ${outSum - inSum}`}.`,
            )}
          />
        </Card>
        <Card title={t("Төлөвөөр", "By status")} subtitle={t("Бүх олон нийтийн мэдээлэл", "All public reports")}>
          <div className="flex h-3 overflow-hidden rounded-xs" aria-hidden>
            {statusCounts.map(({ st, n }) => (
              <span key={st} style={{ width: `${(n / total) * 100}%`, background: `var(--status-${STATUS_META[st].cssKey})` }} />
            ))}
          </div>
          <ul className="mt-4 space-y-2">
            {statusCounts.map(({ st, n }) => (
              <li key={st} className="flex items-center gap-2 text-small">
                <StatusDot status={st} />
                <span className="flex-1">{pick(STATUS_META[st].label)}</span>
                <span className="font-[600] tnum">{n}</span>
                <span className="w-12 text-right text-ink-subtle tnum">{Math.round((n / total) * 100)}%</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-3">
        <Card title={t("Ангиллаар", "Open by category")} subtitle={t("Ямар асуудал хуримтлагдаж байна вэ?", "Which problems pile up?")}>
          <BarList
            ariaLabel={t("Ангиллаар нээлттэй мэдээлэл", "Open reports by category")}
            items={catalog.list
              .map((c) => ({ key: c.id, label: pick(c.name), icon: catalog.icon(c.id), value: view.categoryCounts.get(c.id) ?? 0 }))
              .filter((i) => i.value > 0)
              .sort((a, b) => b.value - a.value)}
          />
        </Card>
        <Card title={t("Дүүргээр", "Open by district")} subtitle={t("Хаана илүү их байна вэ?", "Where are they?")}>
          <BarList
            ariaLabel={t("Дүүргээр нээлттэй мэдээлэл", "Open reports by district")}
            items={DISTRICT_ORDER.map((d) => ({ key: d, label: pick(DISTRICT_META[d].label), value: view.districtCounts[d] ?? 0 })).sort((a, b) => b.value - a.value)}
          />
        </Card>
        <Card title={t("Нээлттэй мэдээллийн нас", "Age of open reports")} subtitle={t("Иргэд хэр удаан хүлээж байна вэ?", "How long have people been waiting?")}>
          <BarList
            ariaLabel={t("Насаар", "By age")}
            items={view.ages.map((b) => ({
              key: b.key,
              label: lang === "mn" ? b.mn : b.en,
              value: b.value,
              color: b.key === "gt30" ? "var(--danger-fill)" : b.key === "14-30" ? "var(--status-investigating)" : undefined,
            }))}
          />
        </Card>
      </div>
      <p className="mt-6 text-caption text-ink-subtle">
        {server.configured
          ? t(`Тоонууд мэдээллийн сангаас (${periodLabel}) тооцоологдсон. Нуусан мэдээллийг оруулаагүй.`, `Figures are counted in the database (${periodLabel}). Hidden reports are excluded.`)
          : t(`Тоонууд ${periodLabel}-ийн демо өгөгдөл дээр тооцоологдсон. Нуусан мэдээллийг оруулаагүй.`, `Figures are calculated from demo data (${periodLabel}). Hidden reports are excluded.`)}
      </p>
    </div>
  );
}
