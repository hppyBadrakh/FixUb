"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CircleCheck, CircleX, ClipboardList, EyeOff, LogIn, Plus } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState, PageSkeleton, SampleDataPill, useToast } from "@/components/ui/feedback";
import { SegmentedControl } from "@/components/ui/form";
import { Card } from "@/components/ui/overlay";
import { ReportCard } from "@/components/fixub/report-parts";
import { StatusDot } from "@/components/fixub/status";
import { isOpen, reportTitle } from "@/lib/domain/metrics";
import { timeAgo } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { CLOSURE_LABEL, STATUS_META } from "@/lib/meta";
import { useNow, useStore } from "@/lib/store";
import type { StatusTimelineEvent } from "@/lib/types";

export function MyReports() {
  const { ready, state, user, act, freshIds, catalog } = useStore();
  const { lang, t, pick } = useT();
  const router = useRouter();
  const toast = useToast();
  const now = useNow();
  const [filter, setFilter] = useState<"all" | "open" | "done">("all");
  const [lastSeen, setLastSeen] = useState<number | null>(null);

  // "Changes since your last visit" (design proposal D-04), kept per user in this browser.
  useEffect(() => {
    if (!user) return;
    const key = `fixub-last-seen-${user.id}`;
    let prev = 0;
    try {
      prev = Number(localStorage.getItem(key)) || 0;
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once per visit
    setLastSeen(prev || Date.now() - 7 * 864e5);
    const id = setTimeout(() => {
      try {
        localStorage.setItem(key, String(Date.now()));
      } catch {}
    }, 3000);
    return () => clearTimeout(id);
  }, [user]);

  const mine = useMemo(
    () => (user ? state.reports.filter((r) => r.reporterId === user.id).sort((a, b) => b.createdAt - a.createdAt) : []),
    [state.reports, user],
  );
  const followed = useMemo(
    () => (user ? state.reports.filter((r) => r.reporterId === user.id || r.confirmations.includes(user.id)) : []),
    [state.reports, user],
  );

  if (!ready) return <PageSkeleton />;
  if (!user) {
    return (
      <>
        <h1 className="sr-only">{t("Миний мэдээлэл", "My reports")}</h1>
        <EmptyState
          className="py-24"
          icon={LogIn}
          title={t("Өөрийн мэдээллээ харахын тулд нэвтэрнэ үү", "Sign in to see your reports")}
          action={
            <ButtonLink href="/login?next=/my-reports" variant="primary">
              {t("Нэвтрэх", "Sign in")}
            </ButtonLink>
          }
        />
      </>
    );
  }

  const needsAnswer = mine.filter((r) => r.status === "resolved" && r.visibility === "visible" && !r.feedback.some((f) => f.userId === user.id));
  const changes = followed
    .flatMap((r) =>
      r.timeline
        .filter((e): e is StatusTimelineEvent => e.type === "status" && e.from !== null && e.at > (lastSeen ?? 0))
        .map((e) => ({ r, e })),
    )
    .sort((a, b) => b.e.at - a.e.at)
    .slice(0, 8);
  const list = mine.filter((r) => (filter === "all" ? true : filter === "open" ? isOpen(r) : !isOpen(r)));

  return (
    <div className="mx-auto max-w-[880px] px-4 py-6 md:px-6 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-title-1 font-[650] tracking-tight">{t("Миний мэдээлэл", "My reports")}</h1>
        <SampleDataPill />
      </div>
      <p className="mt-1 text-small text-ink-muted">
        {user.name} · {t("Таны нэр олон нийтэд харагдахгүй.", "Your name is never shown publicly.")}
      </p>

      {needsAnswer.length > 0 && (
        <section className="mt-8" aria-labelledby="needs">
          <h2 id="needs" className="text-title-3 font-[600]">
            {t("Таны хариулт хэрэгтэй", "Needs your answer")}
          </h2>
          <ul className="mt-3 space-y-2">
            {needsAnswer.map((r) => {
              const org = state.organizations.find((o) => o.id === r.organizationId);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface p-4">
                  <div className="min-w-0 flex-1">
                    <Link href={`/reports/${r.id}`} className="text-label font-[600] hover:underline">
                      {reportTitle(r, lang, catalog)}
                    </Link>
                    <p className="text-small text-ink-muted">
                      {t(
                        `${timeAgo(r.statusChangedAt, now, lang)} ${org ? pick(org.name) : ""} шийдвэрлэсэн гэж тэмдэглэсэн. Үнэхээр зассан уу?`,
                        `Marked resolved ${timeAgo(r.statusChangedAt, now, lang)} by ${org ? pick(org.name) : "the organization"}. Is it actually fixed?`,
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {(["fixed", "not_fixed"] as const).map((v) => (
                      <Button
                        key={v}
                        icon={v === "fixed" ? CircleCheck : CircleX}
                        onClick={async () => {
                          const res = await act.setVerdict(r.id, v);
                          if (res.ok)
                            toast({
                              tone: "success",
                              title: v === "fixed" ? t("Баярлалаа — зассан гэж бүртгэлээ", "Thanks — recorded as fixed") : t("Баярлалаа — засаагүй гэж бүртгэлээ", "Thanks — recorded as still broken"),
                              body: t("Таны хариулт тоогоор олон нийтэд харагдана.", "Your answer is shown publicly as a count."),
                            });
                        }}
                      >
                        {v === "fixed" ? t("Зассан", "Fixed") : t("Засаагүй хэвээр", "Still broken")}
                      </Button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Card
        className="mt-8"
        title={t("Сүүлд орсноос хойших өөрчлөлт", "Changes since your last visit")}
        subtitle={t("Таны мэдээлсэн эсвэл баталгаажуулсан асуудлын төлөвийн шинэчлэл", "Status updates on reports you made or confirmed")}
        flush
      >
        {changes.length === 0 ? (
          <p className="px-5 py-6 text-small text-ink-muted">{t("Шинэ өөрчлөлт алга.", "No new changes.")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {changes.map(({ r, e }) => (
              <li key={e.id} className={freshIds.has(r.id) ? "fx-fresh" : undefined}>
                <Link href={`/reports/${r.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-sunken/60 md:px-5">
                  <StatusDot status={e.to} className="mt-2" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-label font-[600]">{reportTitle(r, lang, catalog)}</span>
                    <span className="block text-small text-ink-muted">
                      {e.to === "closed" && e.reason === "duplicate"
                        ? t("Давхардсан тул хаасан — таны мэдээлэл үндсэн мэдээлэлд “Надад ч бас” болж тоологдоно", "Closed as duplicate — your report now counts as a “me too” there")
                        : e.to === "closed" && e.reason
                          ? `${pick(STATUS_META.closed.label)} · ${pick(CLOSURE_LABEL[e.reason])}`
                          : t(`${STATUS_META[e.to].label.mn} төлөвт шилжсэн`, `Moved to ${STATUS_META[e.to].label.en}`)}
                    </span>
                  </span>
                  <span className="shrink-0 text-caption text-ink-subtle">{timeAgo(e.at, now, lang)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <section className="mt-8" aria-labelledby="all">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="all" className="text-title-3 font-[600]">
            {t("Миний бүх мэдээлэл", "All my reports")}
          </h2>
          <SegmentedControl
            label={t("Шүүлтүүр", "Filter")}
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: t(`Бүгд (${mine.length})`, `All (${mine.length})`) },
              { value: "open", label: t("Нээлттэй", "Open") },
              { value: "done", label: t("Шийдвэрлэсэн, хаасан", "Resolved & closed") },
            ]}
          />
        </div>
        {list.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={mine.length ? t("Энд мэдээлэл алга", "Nothing here") : t("Та одоохондоо мэдээлээгүй байна", "You haven't reported anything yet")}
            action={
              <ButtonLink href="/reports/new" variant="primary" icon={Plus}>
                {t("Асуудал мэдээлэх", "Report a problem")}
              </ButtonLink>
            }
          />
        ) : (
          <ul className="mt-3 space-y-2">
            {list.map((r) => (
              <li key={r.id}>
                <ReportCard
                  report={r}
                  now={now}
                  fresh={freshIds.has(r.id)}
                  onOpen={(id) => router.push(`/reports/${id}`)}
                  extra={
                    r.visibility === "hidden" ? (
                      <span className="mt-1 flex items-center gap-1 text-caption font-[550] text-danger">
                        <EyeOff aria-hidden className="size-3.5" />
                        {t("Хяналтаар нуусан — зөвхөн танд харагдана", "Hidden by a moderator — only you can see it")}
                      </span>
                    ) : null
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
