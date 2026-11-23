"use client";

import { useMemo, useState } from "react";
import { CircleCheck, Inbox, Search, TriangleAlert, Wrench } from "lucide-react";
import { EmptyState, PageSkeleton, SampleDataPill } from "@/components/ui/feedback";
import { SegmentedControl } from "@/components/ui/form";
import { Card } from "@/components/ui/overlay";
import { ActivityFeed, KpiCard, ReportTable, sortReports, type SortKey } from "@/components/fixub/data";
import { ReportMap } from "@/components/fixub/report-map";
import { useDashboard } from "@/lib/api/dashboard";
import { isOpen, summarize } from "@/lib/domain/metrics";
import { useT } from "@/lib/i18n";
import { OPEN_STATUSES, ROLE_LABEL } from "@/lib/meta";
import { useNow, useStore } from "@/lib/store";

export function StaffQueue() {
  const { ready, state, user, freshIds, catalog } = useStore();
  const { lang, t, pick } = useT();
  const now = useNow(15_000);
  const [tab, setTab] = useState<"unit" | "open" | "done">("open");
  // Most urgent first; equal priorities fall back to oldest first.
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "priority", dir: "desc" });

  const org = state.organizations.find((o) => o.id === user?.organizationId);
  const unit = org?.units.find((u) => u.id === user?.unitId);
  const mine = useMemo(
    () => state.reports.filter((r) => r.organizationId === user?.organizationId && r.visibility === "visible"),
    [state.reports, user?.organizationId],
  );
  const unitId = user?.unitId;
  const lists = useMemo(
    () => ({
      unit: mine.filter((r) => isOpen(r) && !!unitId && r.unitId === unitId),
      open: mine.filter(isOpen),
      done: mine.filter((r) => !isOpen(r)),
    }),
    [mine, unitId],
  );
  const rows = useMemo(() => sortReports(lists[tab], sort, lang, catalog), [lists, tab, sort, lang, catalog]);
  // Counted in SQL on the server; the same definitions run here until the answer arrives.
  const dashboard = useDashboard("staff", 7);
  const s = useMemo(() => dashboard?.summary ?? summarize(mine, now, 7), [dashboard, mine, now]);
  const activity = useMemo(() => {
    const ids = new Set(mine.map((r) => r.id));
    return state.activity.filter((a) => ids.has(a.reportId)).slice(0, 20);
  }, [state.activity, mine]);

  if (!ready || !user) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-[1280px] space-y-6 px-4 py-6 md:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-title-1 font-[650] tracking-tight">{t("Ажлын дараалал", "Work queue")}</h1>
          <p className="text-small text-ink-muted">
            {org ? pick(org.name) : "—"}
            {unit && ` · ${pick(unit.name)}`} · {user.name}, {pick(ROLE_LABEL[user.role]).toLowerCase()}
          </p>
        </div>
        <SampleDataPill />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard icon={Inbox} label={t("Нээлттэй", "Open")} value={s.open} definition={t("Танай байгууллагад хуваарилагдсан нээлттэй мэдээлэл.", "Open reports assigned to your organization.")} />
        <KpiCard
          icon={Search}
          label={t("Шалгаагүй", "Awaiting review")}
          value={s.awaiting}
          attention={s.awaiting > 0}
          definition={t("“Мэдээлэгдсэн” төлөвтэй: хэн ч хараахан арга хэмжээ аваагүй.", "Status “Reported”: nobody has acted yet.")}
        />
        <KpiCard icon={Wrench} label={t("Ажиллаж буй", "Being worked on")} value={s.working} definition={t("Шалгаж байна + засварлаж байна.", "Investigating + in progress.")} />
        <KpiCard icon={CircleCheck} label={t("Шийдвэрлэсэн · 7 хоног", "Resolved · 7 days")} value={s.resolved} definition={t("Сүүлийн 7 хоногт шийдвэрлэсэн.", "Moved to Resolved in the last 7 days.")} />
      </div>

      <Card
        title={t("Хуваарилагдсан ажил", "Assigned work")}
        subtitle={t("Яаралтай нь эхэндээ · ач холбогдлыг FixUB баг тогтооно · мөр дээр дарж төлөв шинэчилнэ", "Most urgent first · priority is set by the FixUB team · open a row to update its status")}
        actions={
          <SegmentedControl
            label={t("Шүүлтүүр", "Filter")}
            value={tab}
            onChange={setTab}
            options={[
              ...(user.unitId ? [{ value: "unit" as const, label: t(`Манай баг (${lists.unit.length})`, `My unit (${lists.unit.length})`) }] : []),
              { value: "open" as const, label: t(`Нээлттэй (${lists.open.length})`, `Open (${lists.open.length})`) },
              { value: "done" as const, label: t(`Дууссан (${lists.done.length})`, `Done (${lists.done.length})`) },
            ]}
          />
        }
        flush
      >
        {rows.length ? (
          <ReportTable
            rows={rows}
            state={state}
            now={now}
            sort={sort}
            onSort={(k) => setSort((p) => ({ key: k, dir: p.key === k && p.dir === "desc" ? "asc" : "desc" }))}
            hrefFor={(id) => `/staff/reports/${id}`}
            fresh={freshIds}
            caption={t("Хуваарилагдсан ажил", "Assigned work")}
          />
        ) : (
          <EmptyState icon={TriangleAlert} title={t("Энд ажил алга", "No work here")}>
            {t("FixUB баг шинэ мэдээлэл хуваарилахад энд гарч ирнэ.", "New reports appear here when the FixUB team assigns them.")}
          </EmptyState>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-12">
        <Card className="xl:col-span-5" title={t("Сүүлийн үйл явдал", "Recent activity")} subtitle={t("Танай байгууллагын мэдээлэл", "Your organization's reports")} flush>
          <ActivityFeed now={now} events={activity} state={state} hrefFor={(id) => `/staff/reports/${id}`} fresh={freshIds} maxHeight={400} />
        </Card>
        <Card className="xl:col-span-7" title={t("Нээлттэй ажлын байршил", "Where open work is")} flush>
          <ReportMap
            className="h-[400px] rounded-b-md"
            ariaLabel={t("Нээлттэй ажлын газрын зураг", "Map of open work")}
            reports={lists.open}
            detailHref={(id) => `/staff/reports/${id}`}
            legendStatuses={OPEN_STATUSES}
          />
        </Card>
      </div>
    </div>
  );
}
