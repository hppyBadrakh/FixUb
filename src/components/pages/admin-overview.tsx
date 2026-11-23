"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, CircleCheck, Clock, Flag, Gauge, Inbox, List, Search, TriangleAlert, Wrench } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Banner, PageSkeleton, SampleDataPill } from "@/components/ui/feedback";
import { SegmentedControl } from "@/components/ui/form";
import { Card } from "@/components/ui/overlay";
import { ActivityFeed, BarList, KpiCard, ReportTable, TrendChart, sortReports, type SortKey } from "@/components/fixub/data";
import { ReportMap } from "@/components/fixub/report-map";
import { useDashboard } from "@/lib/api/dashboard";
import { ageBuckets, dailySeries, isOpen, summarize } from "@/lib/domain/metrics";
import { formatHours } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { OPEN_STATUSES, RESPONSE_TARGET_DAYS } from "@/lib/meta";
import { useNow, useStore } from "@/lib/store";

export function deltaOf(cur: number | null, prev: number | null, goodWhen: "up" | "down", comparison: string, format: (n: number) => string = String) {
  if (cur === null || prev === null) return undefined;
  const d = cur - prev;
  return {
    text: `${d >= 0 ? "+" : "−"}${format(Math.abs(d))}`,
    direction: d > 0 ? ("up" as const) : d < 0 ? ("down" as const) : ("flat" as const),
    good: d === 0 ? null : goodWhen === "up" ? d > 0 : d < 0,
    comparison,
  };
}

export function AdminOverview() {
  const { ready, state, server, freshIds, catalog } = useStore();
  const { lang, t, pick } = useT();
  const now = useNow(15_000);
  const [range, setRange] = useState<"1" | "7" | "30">("7");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "priority", dir: "desc" });
  const days = Number(range) as 1 | 7 | 30;
  // These numbers are counted in SQL; until they arrive the same definitions run here on the
  // loaded reports.
  const dashboard = useDashboard("admin", days);

  const visible = useMemo(() => state.reports.filter((r) => r.visibility === "visible"), [state.reports]);
  const s = useMemo(() => dashboard?.summary ?? summarize(visible, now, days), [dashboard, visible, now, days]);
  const series = useMemo(() => dashboard?.series ?? dailySeries(visible, now, 14), [dashboard, visible, now]);
  const ages = useMemo(() => dashboard?.ageBuckets ?? ageBuckets(visible, now), [dashboard, visible, now]);
  const triage = useMemo(
    // Needs the admin: no priority yet, or no responsible organization yet.
    () => sortReports(visible.filter((r) => OPEN_STATUSES.includes(r.status) && (!r.priority || !r.organizationId)), sort, lang, catalog),
    [visible, sort, lang, catalog],
  );
  const openReports = useMemo(() => visible.filter(isOpen), [visible]);
  const overdue = openReports.filter((r) => r.dueAt && now > r.dueAt).length;
  const disputed = visible.filter((r) => r.status === "resolved" && r.disputedAt).length;
  const flagged = dashboard?.flagged ?? state.reports.filter((r) => r.flags.some((f) => f.status === "open")).length;

  if (!ready) return <PageSkeleton />;

  const comparison = t(` өмнөх ${days} хоногтой харьцуулахад`, ` vs previous ${days === 1 ? "day" : `${days} days`}`);
  const inSum = series.incoming.reduce((a, b) => a + b, 0);
  const outSum = series.resolved.reduce((a, b) => a + b, 0);
  // Open reports per unit, and per organization for those without a unit.
  const openFor = (organizationId: string, unitId: string | null) =>
    dashboard
      ? (dashboard.workload.find((w) => w.organizationId === organizationId && w.unitId === unitId)?.open ?? 0)
      : openReports.filter((r) => r.organizationId === organizationId && (r.unitId ?? null) === unitId).length;
  const workload = state.organizations
    .flatMap((o) => [
      ...o.units.map((u) => ({ key: u.id, label: pick(u.name), value: openFor(o.id, u.id) })),
      { key: `${o.id}-none`, label: `${pick(o.name).replace(/\s*\((демо|demo)\)/, "")} · ${t("баггүй", "no unit")}`, value: openFor(o.id, null) },
    ])
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
  workload.push({ key: "unassigned", label: t("Хуваарилаагүй", "Unassigned"), value: s.unassigned, color: "var(--status-closed)" } as (typeof workload)[number]);

  return (
    <div className="mx-auto max-w-[1280px] space-y-6 px-4 py-6 md:px-6 lg:px-8">
      {server.demoLogin && (
        <Banner tone="warning" title={t("Жишээ өгөгдөл — бодит мэдээлэл биш", "Sample data — not real reports")}>
          {t(
            "Энэ бол жишээ мэдээллээр дүүргэсэн танилцуулгын хувилбар. Өөр төхөөрөмжөөс хийсэн өөрчлөлт 15 секундын дотор энд харагдана.",
            "This is a demonstration deployment filled with sample reports. Changes made on another device appear here within 15 seconds.",
          )}
        </Banner>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-title-1 font-[650] tracking-tight">{t("Үйл ажиллагааны тойм", "Operations overview")}</h1>
          <p className="text-small text-ink-muted">{t("FixUB баг · бүх байгууллага · цаг Asia/Ulaanbaatar", "FixUB team · all organizations · times in Asia/Ulaanbaatar")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-caption font-[600] text-accent">
            <span aria-hidden className="size-2 rounded-full bg-accent" />
            {t("Шууд · 15 сек тутам", "Live · every 15 s")}
          </span>
          <SampleDataPill />
          <SegmentedControl
            label={t("Хугацаа", "Range")}
            value={range}
            onChange={setRange}
            options={[
              { value: "1", label: t("Өнөөдөр", "Today") },
              { value: "7", label: t("7 хоног", "7 days") },
              { value: "30", label: t("30 хоног", "30 days") },
            ]}
          />
        </div>
      </div>

      <section aria-labelledby="now">
        <h2 id="now" className="mb-2 text-eyebrow font-[650] uppercase tracking-wide text-ink-muted">
          {t("Яг одоо", "Right now")}
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <KpiCard icon={Inbox} label={t("Нээлттэй", "Open reports")} value={s.open} definition={t("Мэдээлэгдсэн, шалгаж буй, засварлаж буй.", "Reported, investigating or in progress.")} />
          <KpiCard
            icon={Gauge}
            label={t("Ач холбогдол хүлээж буй", "Awaiting priority")}
            value={openReports.filter((r) => !r.priority).length}
            attention={openReports.some((r) => !r.priority)}
            href="/admin/reports"
            definition={t("Иргэн илгээсэн, админ хараахан хянаагүй.", "Submitted by citizens, not yet reviewed by an admin.")}
          />
          <KpiCard
            icon={Search}
            label={t("Хуваарилаагүй", "Unassigned")}
            value={s.unassigned}
            attention={s.unassigned > 0}
            href="/admin/reports"
            definition={t("Хариуцагчгүй нээлттэй мэдээлэл — таны дараалал.", "Open reports with no organization — your triage queue.")}
          />
          <KpiCard icon={Wrench} label={t("Ажиллаж буй", "Being worked on")} value={s.working} definition={t("Шалгаж байна + засварлаж байна.", "Investigating + in progress.")} />
          <KpiCard
            icon={CircleCheck}
            label={t(`Шийдвэрлэсэн · ${days === 1 ? "өнөөдөр" : `${days} хоног`}`, `Resolved · ${days === 1 ? "today" : `${days} days`}`)}
            value={s.resolved}
            delta={deltaOf(s.resolved, s.resolvedPrev, "up", comparison)}
            definition={t("Хугацаанд шийдвэрлэсэн төлөвт шилжсэн. Иргэдийн хариулт орохгүй.", "Moved to Resolved in the period. Citizen verdicts not included.")}
          />
          <KpiCard
            icon={Clock}
            label={t("Анхны хариу", "Median first response")}
            value={s.medianResponse === null ? null : formatHours(s.medianResponse, lang)}
            unavailable={t("хугацаанд хариу алга", "none in this period")}
            delta={deltaOf(s.medianResponse, s.medianResponsePrev, "down", comparison, (n) => formatHours(n, lang))}
            definition={t("Мэдээлснээс анхны төлөв өөрчлөлт хүртэл (медиан).", "Reported → first status change (median).")}
          />
          <KpiCard
            icon={TriangleAlert}
            label={t("Хугацаа хэтэрсэн", "Overdue")}
            value={overdue}
            attention={overdue > 0}
            href="/admin/reports"
            definition={t(
              `Ач холбогдлын зорилтот хугацаа хэтэрсэн (яаралтай ${RESPONSE_TARGET_DAYS.critical}, өндөр ${RESPONSE_TARGET_DAYS.high}, дунд ${RESPONSE_TARGET_DAYS.medium}, бага ${RESPONSE_TARGET_DAYS.low} хоног). 14 хоногоос удсан: ${s.openOver14}.`,
              `Past the target for its priority (critical ${RESPONSE_TARGET_DAYS.critical}, high ${RESPONSE_TARGET_DAYS.high}, medium ${RESPONSE_TARGET_DAYS.medium}, low ${RESPONSE_TARGET_DAYS.low} days). Open over 14 days: ${s.openOver14}.`,
            )}
          />
        </div>
      </section>

      <Card
        title={t("Хянах дараалал", "Review queue")}
        subtitle={t("Ач холбогдол эсвэл хариуцагч тогтоогоогүй · хянагдаагүй нь эхэндээ", "No priority or no owner yet · unreviewed first")}
        actions={
          <ButtonLink href="/admin/reports" size="sm" iconEnd={ArrowRight}>
            {t("Бүх мэдээлэл", "All reports")}
          </ButtonLink>
        }
        flush
      >
        {triage.length ? (
          <ReportTable
            rows={triage.slice(0, 8)}
            state={state}
            now={now}
            sort={sort}
            onSort={(k) => setSort((p) => ({ key: k, dir: p.key === k && p.dir === "desc" ? "asc" : "desc" }))}
            hrefFor={(id) => `/admin/reports/${id}`}
            fresh={freshIds}
            caption={t("Хянах дараалал", "Review queue")}
          />
        ) : (
          <p className="px-5 py-8 text-center text-small text-ink-muted">{t("Бүх мэдээлэл хянагдаж, хуваарилагдсан.", "Everything is reviewed and assigned.")}</p>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-12">
        <Card className="xl:col-span-5" title={t("Шууд үйл явдал", "Live activity")} subtitle={t("Шинэ нь эхэндээ · бүх байгууллага", "Newest first · all organizations")} flush>
          <ActivityFeed now={now} events={state.activity.slice(0, 30)} state={state} hrefFor={(id) => `/admin/reports/${id}`} fresh={freshIds} maxHeight={430} />
        </Card>
        <Card
          className="xl:col-span-7"
          title={t("Нээлттэй мэдээллийн байршил", "Where open reports are")}
          subtitle={t("Тэмдэг дээр дарж дэлгэрэнгүйг нээнэ", "Select a marker to open the report")}
          flush
        >
          <ReportMap
            className="h-[430px] rounded-b-md"
            ariaLabel={t("Нээлттэй мэдээллийн газрын зураг", "Map of open reports")}
            reports={openReports}
            detailHref={(id) => `/admin/reports/${id}`}
            legendStatuses={OPEN_STATUSES}
          />
        </Card>
      </div>

      <Card title={t("Ирсэн ба шийдвэрлэсэн", "Incoming vs resolved")} subtitle={t("Өдөр бүр, сүүлийн 14 хоног · хүлээгдэж буй ажил өсөж байна уу?", "Per day, last 14 days · is the backlog growing?")}>
        <TrendChart
          labels={series.labels}
          series={[
            { id: "in", label: t("Ирсэн", "Incoming"), color: "var(--brand)", values: series.incoming },
            { id: "out", label: t("Шийдвэрлэсэн", "Resolved"), color: "var(--status-resolved)", values: series.resolved },
          ]}
          summary={t(
            `Ирсэн ${inSum}, шийдвэрлэсэн ${outSum} — ${inSum > outSum ? "хүлээгдэж буй ажил өссөн" : "хүлээгдэж буй ажил өсөөгүй"}.`,
            `Incoming ${inSum}, resolved ${outSum} — ${inSum > outSum ? "the backlog grew" : "the backlog did not grow"}.`,
          )}
        />
      </Card>

      <div className="grid gap-6 md:grid-cols-3">
        <Card title={t("Ангиллаар", "Open by category")} subtitle={t("Ямар асуудал хуримтлагдаж байна?", "Which problems pile up?")}>
          <BarList
            ariaLabel={t("Ангиллаар", "By category")}
            items={catalog.list
              .map((c) => ({ key: c.id, label: pick(c.name), icon: catalog.icon(c.id), value: openReports.filter((r) => r.category === c.id).length }))
              .filter((i) => i.value)
              .sort((a, b) => b.value - a.value)}
          />
        </Card>
        <Card title={t("Нас", "Age of open reports")} subtitle={t("Хэр удаан хүлээж байна?", "How long have people been waiting?")}>
          <BarList
            ariaLabel={t("Насаар", "By age")}
            items={ages.map((b) => ({
              key: b.key,
              label: lang === "mn" ? b.mn : b.en,
              value: b.value,
              color: b.key === "gt30" ? "var(--danger-fill)" : b.key === "14-30" ? "var(--status-investigating)" : undefined,
            }))}
          />
        </Card>
        <Card title={t("Ачаалал", "Workload by unit")} subtitle={t("Нээлттэй мэдээлэл хариуцагчаар", "Open reports per assignee")}>
          <BarList ariaLabel={t("Багаар", "By unit")} items={workload} />
        </Card>
      </div>

      {disputed > 0 && (
        <Link href="/admin/reports" className="flex items-center gap-3 rounded-md border border-line bg-surface p-4 hover:border-line-strong">
          <TriangleAlert aria-hidden className="size-5 text-warning" />
          <span className="flex-1 text-label font-[600]">
            {t(`Шийдвэрлэсэн ${disputed} мэдээллийг иргэд засаагүй гэж үзэж байна`, `Citizens say ${disputed} resolved report${disputed > 1 ? "s are" : " is"} still broken`)}
          </span>
          <List aria-hidden className="size-5 text-ink-muted" />
        </Link>
      )}
      {flagged > 0 && (
        <Link href="/admin/moderation" className="flex items-center gap-3 rounded-md border border-line bg-surface p-4 hover:border-line-strong">
          <Flag aria-hidden className="size-5 text-danger" />
          <span className="flex-1 text-label font-[600]">
            {t(`${flagged} мэдээлэлд хяналт хэрэгтэй`, `${flagged} report${flagged > 1 ? "s" : ""} need moderation`)}
          </span>
          <List aria-hidden className="size-5 text-ink-muted" />
        </Link>
      )}
    </div>
  );
}
