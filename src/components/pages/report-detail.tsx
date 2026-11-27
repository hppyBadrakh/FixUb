"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, Copy, EyeOff, Flag, Info, SearchX } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Banner, EmptyState, PageSkeleton, SampleDataPill, useToast } from "@/components/ui/feedback";
import { Select, TextField } from "@/components/ui/form";
import { Dialog } from "@/components/ui/overlay";
import { NoPhoto, Photo } from "@/components/fixub/photo";
import { CitizenSignals, MetaRow, ReportCard, StatusTimeline } from "@/components/fixub/report-parts";
import { ReportMap } from "@/components/fixub/report-map";
import { CategoryTag, PriorityBadge, StatusBadge } from "@/components/fixub/status";
import { distanceM } from "@/lib/domain/geo";
import { descriptionOf, placeOf, reportTitle } from "@/lib/domain/metrics";
import { formatDateTime, timeAgo } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { DISTRICT_META, FLAG_REASON_LABEL, OPEN_STATUSES, PRIORITY_META } from "@/lib/meta";
import { LIVE_REFRESH_MS, useApi } from "@/lib/api/hooks";
import type { ReportResponse } from "@/lib/api/types";
import { useNow, useStore } from "@/lib/store";
import type { AppState, FlagReason, Report } from "@/lib/types";

export function nextStep(r: Report, state: AppState, t: (mn: string, en: string) => string, pick: (b: { mn: string; en: string }) => string) {
  const org = state.organizations.find((o) => o.id === r.organizationId);
  switch (r.status) {
    case "reported":
      if (!r.priority)
        return {
          title: t("FixUB баг хянаж, ач холбогдлыг тогтооно", "The FixUB team reviews it and sets its priority"),
          detail: t("Дараа нь хариуцах байгууллагад шилжүүлнэ.", "Then it is assigned to the responsible organization."),
        };
      return org
        ? { title: t("Байгууллага шалгана (Шалгаж байна)", "The organization reviews it (Investigating)"), detail: t(`${pick(org.name)} хариуцна.`, `${pick(org.name)} is responsible.`) }
        : { title: t("Хариуцах байгууллагад шилжүүлнэ", "Assigned to the responsible organization"), detail: t("FixUB баг ангиллаар нь хариуцагчийг тогтооно.", "The FixUB team routes it by category.") };
    case "investigating":
      return { title: t("Засвар төлөвлөх (Засварлаж байна) эсвэл шийдвэрлэх", "Work scheduled (In progress) or resolved"), detail: t("Энэ ангилалд хугацааны норм нийтлэгдээгүй.", "No deadline is published for this category.") };
    case "in_progress":
      return { title: t("Шийдвэрлэсэн", "Resolved"), detail: t("Засвар дуусахад байгууллага тэмдэглэнэ.", "Set by the organization when the repair is done.") };
    case "resolved":
      return { title: t("Иргэд баталгаажуулна", "Citizens confirm"), detail: t("Засаагүй гэж олон хүн хариулбал менежер дахин нээж болно.", "If most people say it's still broken, a manager can reopen it.") };
    default:
      return undefined;
  }
}

export function ReportDetail() {
  const { id } = useParams<{ id: string }>();
  const { ready, state, user, server, act, freshIds, catalog } = useStore();
  // Read once into a plain value: React Compiler turned `user?.id` in the JSX below into `user.id`
  // in a dependency check, which threw for every signed-out visitor.
  const myId = user ? user.id : null;
  const isAdmin = user ? user.role === "admin" : false;
  const { lang, t, pick } = useT();
  const toast = useToast();
  const router = useRouter();
  const now = useNow();
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagReason, setFlagReason] = useState<FlagReason>("spam");
  const [flagDetails, setFlagDetails] = useState("");

  // Usually the report is already in the store's lists. An older one (the public list only goes
  // back 90 days) is fetched on its own.
  const listed = state.reports.find((r) => r.id === id);
  const single = useApi<ReportResponse>(ready && !listed ? `/api/v1/reports/${id}` : null, { refreshInterval: LIVE_REFRESH_MS });
  const report = listed ?? single.data?.report;
  const nearby = useMemo(() => {
    if (!report) return [];
    return state.reports
      .filter((r) => r.id !== report.id && r.visibility === "visible" && r.category === report.category && OPEN_STATUSES.includes(r.status))
      .map((r) => ({ r, d: distanceM(report, r) }))
      .filter((x) => x.d < 1500)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);
  }, [report, state.reports]);

  if (!ready || (!listed && single.isLoading)) return <PageSkeleton />;
  const canSeeHidden = !!report && (isAdmin || (myId !== null && report.reporterId === myId));
  if (!report || (report.visibility === "hidden" && !canSeeHidden)) {
    return (
      <EmptyState
        className="py-24"
        icon={SearchX}
        title={t("Ийм мэдээлэл байхгүй эсвэл танд харагдахгүй", "This report doesn't exist or isn't visible to you")}
        action={<ButtonLink href="/">{t("Газрын зураг руу буцах", "Back to the map")}</ButtonLink>}
      />
    );
  }

  const org = state.organizations.find((o) => o.id === report.organizationId);
  const unit = org?.units.find((u) => u.id === report.unitId);
  const original = report.duplicateOfId ? state.reports.find((r) => r.id === report.duplicateOfId) : undefined;
  const signIn = () => router.push(`/login?next=/reports/${report.id}`);
  const errorText = (e: string) =>
    ({
      signed_out: t("Эхлээд нэвтэрнэ үү.", "Sign in first."),
      own_report: t("Өөрийн мэдээлэлд нэмэх боломжгүй.", "You can't “me too” your own report."),
      not_open: t("Энэ мэдээлэл хаагдсан.", "This report is no longer open."),
      already_flagged: t("Та аль хэдийн мэдэгдсэн байна.", "You've already flagged this report."),
      not_resolved: t("Энэ мэдээлэл шийдэгдээгүй байна.", "This report isn't resolved."),
      forbidden: t("Зөвхөн мэдээлсэн хүн болон “Надад ч бас” дарсан хүмүүс хариулна.", "Only the reporter and people who said “me too” can answer."),
      rate_limited: t("Хэт олон хүсэлт илгээлээ. Хэсэг хүлээгээд дахин оролдоно уу.", "Too many requests. Wait a little and try again."),
    })[e] ?? t("Алдаа гарлаа. Дахин оролдоно уу.", "Something went wrong. Try again.");

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-6 md:py-8">
      <Link href="/" className="inline-flex items-center gap-1 text-small font-[600] text-brand hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> {t("Газрын зураг руу", "Back to map")}
      </Link>

      {server.reviewBeforePublic && report.visibility === "visible" && report.priority === null && myId !== null && report.reporterId === myId && (
        <Banner tone="info" className="mt-4" title={t("Хянагдахыг хүлээж байна", "Waiting for review")}>
          {t(
            "Одоогоор зөвхөн та харж байна. FixUB баг хянасны дараа нийтэд харагдана.",
            "Only you can see it for now. It becomes public once the FixUB team has reviewed it.",
          )}
        </Banner>
      )}
      {report.visibility === "hidden" && (
        <Banner tone="warning" icon={EyeOff} className="mt-4" title={t("Энэ мэдээлэл нуугдсан", "This report is hidden")}>
          {t(
            "Хяналтын шалгалтаар олон нийтээс нуусан. Зөвхөн та болон админ харах боломжтой.",
            "A moderator hid it from public pages. Only you and admins can see it.",
          )}
        </Banner>
      )}
      {report.status === "closed" && report.closureReason === "duplicate" && original && (
        <Banner tone="info" className="mt-4" title={t("Давхардсан мэдээлэл", "Closed as a duplicate")}>
          {t("Энэ асуудлыг ", "This problem is tracked in ")}
          <Link href={`/reports/${original.id}`} className="font-[650] text-brand underline">
            {original.ref}
          </Link>
          {t(" дугаартай мэдээллээр хянаж байна. Таны мэдээлэл тэнд “Надад ч бас” болж тоологдоно.", ". Your report counts as a “me too” there.")}
        </Banner>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={report.status} reason={report.closureReason} size="lg" />
        {report.status !== "closed" && <PriorityBadge priority={report.priority} className="py-1 text-small" />}
        <CategoryTag category={report.category} subcategory={report.subcategory} boxed className="text-small" />
        <SampleDataPill />
      </div>
      <h1 className="mt-2 text-title-1 font-[650] tracking-tight">{reportTitle(report, lang, catalog)}</h1>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-subtle">
        <span className="inline-flex items-center gap-1 font-[600] text-ink-muted tnum">
          {report.ref}
          <button
            type="button"
            aria-label={t("Дугаарыг хуулах", "Copy reference")}
            title={t("Хуулах", "Copy")}
            className="grid size-7 place-items-center rounded-sm hover:bg-surface-sunken"
            onClick={() => {
              navigator.clipboard?.writeText(report.ref).then(
                () => toast({ tone: "success", title: t("Хуулсан", "Copied"), body: report.ref }),
                () => {},
              );
            }}
          >
            <Copy aria-hidden className="size-4" />
          </button>
        </span>
        <span>
          {t("Мэдээлсэн", "Reported")} {formatDateTime(report.createdAt, lang)}
        </span>
        <span>
          {t("Шинэчилсэн", "Updated")} {timeAgo(report.statusChangedAt, now, lang)}
        </span>
        <span>{pick(DISTRICT_META[report.district].label)}</span>
      </p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-8">
          {/* Photos */}
          {report.photoIds.length ? (
            <div className={report.photoIds.length === 1 ? "" : "grid gap-2 sm:grid-cols-2"}>
              {report.photoIds.map((pid, i) => (
                <Photo
                  key={pid}
                  id={pid}
                  category={report.category}
                  alt={t(`Мэдээлсэн асуудлын ${report.photoIds.length}-ийн ${i + 1}-р зураг`, `Photo ${i + 1} of ${report.photoIds.length} of the reported problem`)}
                  className={i === 0 && report.photoIds.length !== 2 ? "aspect-[4/3] w-full rounded-md sm:col-span-2 sm:max-h-[420px]" : "aspect-[4/3] w-full rounded-md"}
                />
              ))}
            </div>
          ) : (
            <NoPhoto category={report.category} className="h-40 w-full rounded-md" />
          )}

          <section aria-labelledby="desc">
            <h2 id="desc" className="text-eyebrow font-[650] uppercase tracking-wide text-ink-subtle">
              {t("Иргэний тайлбар", "Citizen's description")}
            </h2>
            <p className="mt-1.5 max-w-[68ch] whitespace-pre-line text-body-lg">{descriptionOf(report, lang)}</p>
            <p className="mt-2 flex items-start gap-1.5 text-caption text-ink-subtle">
              <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              {t(
                "Олон нийтийн гишүүн илгээсэн бөгөөд хараахан баталгаажаагүй. Дээрх төлөвийг хариуцах байгууллага тогтооно.",
                "Submitted by a member of the public and not yet verified. The status above is set by the responsible organization.",
              )}
            </p>
          </section>

          <section aria-labelledby="progress">
            <h2 id="progress" className="mb-3 text-eyebrow font-[650] uppercase tracking-wide text-ink-subtle">
              {t("Явц", "Progress")}
            </h2>
            <div className={freshIds.has(report.id) ? "fx-fresh rounded-md" : undefined}>
              <StatusTimeline report={report} state={state} next={nextStep(report, state, t, pick)} />
            </div>
          </section>
        </div>

        <aside className="min-w-0 space-y-5">
          <ReportMap
            mode="static"
            className="h-56 rounded-md border border-line"
            ariaLabel={t("Мэдээллийн байршил", "Report location")}
            reports={[report]}
            center={report}
            initialZoom={15.5}
            showLegend={false}
          />
          <dl>
            <MetaRow label={t("Байршил", "Location")}>
              {placeOf(report, lang)}, {pick(DISTRICT_META[report.district].label)}
              {report.accuracyM ? <span className="block text-caption text-ink-subtle">± {report.accuracyM} m (GPS)</span> : null}
            </MetaRow>
            <MetaRow label={t("Ангилал", "Category")}>
              {catalog.label(report.category, lang)}
              <span className="block text-ink-muted">{catalog.subLabel(report.category, report.subcategory, lang)}</span>
            </MetaRow>
            <MetaRow label={t("Ач холбогдол", "Priority")}>
              {report.priority ? (
                <>
                  {pick(PRIORITY_META[report.priority].label)}
                  <span className="block text-caption text-ink-subtle">{t("FixUB баг хянаж тогтоосон", "Set by the FixUB team after review")}</span>
                </>
              ) : (
                <>
                  {t("Хянагдаж байна", "Pending review")}
                  <span className="block text-caption text-ink-subtle">{t("FixUB баг хянаж тогтооно", "The FixUB team will review and set it")}</span>
                </>
              )}
            </MetaRow>
            <MetaRow label={t("Хариуцагч", "Responsible")}>{org ? pick(org.name) : <span className="text-warning">{t("Хуваарилаагүй", "Not yet assigned")}</span>}</MetaRow>
            {unit && <MetaRow label={t("Баг", "Unit")}>{pick(unit.name)}</MetaRow>}
          </dl>
          <CitizenSignals
            report={report}
            userId={myId}
            signedIn={!!user}
            onSignIn={signIn}
            onMeToo={async () => {
              const had = myId !== null && report.confirmations.includes(myId);
              const res = await act.toggleMeToo(report.id);
              if (!res.ok) toast({ tone: "danger", title: errorText(res.error) });
              else if (had) toast({ tone: "info", title: t("Таны баталгаажуулалтыг хаслаа", "Your confirmation was removed") });
              else toast({ tone: "success", title: t("Баталгаажуулалт нэмэгдлээ", "Confirmation added"), body: t("Байгууллага нөлөөг нь харна.", "The organization can see the impact.") });
            }}
            onVerdict={async (v) => {
              const res = await act.setVerdict(report.id, v);
              if (!res.ok) toast({ tone: "danger", title: errorText(res.error) });
              else if (v) toast({ tone: "success", title: v === "fixed" ? t("Баярлалаа — зассан гэж бүртгэлээ", "Thanks — recorded as fixed") : t("Баярлалаа — засаагүй гэж бүртгэлээ", "Thanks — recorded as still broken") });
            }}
          />

          {nearby.length > 0 && (
            <section>
              <h2 className="mb-2 text-eyebrow font-[650] uppercase tracking-wide text-ink-subtle">
                {t("Ойролцоо, ижил ангилал", "Nearby, same category")}
              </h2>
              <ul className="space-y-2">
                {nearby.map(({ r }) => (
                  <li key={r.id}>
                    <ReportCard report={r} now={now} onOpen={(rid) => router.push(`/reports/${rid}`)} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Button
            variant="quiet"
            icon={Flag}
            className="-ml-3 text-ink-muted"
            onClick={() => (user ? setFlagOpen(true) : signIn())}
          >
            {t("Зохисгүй агуулга мэдэгдэх", "Report inappropriate content")}
          </Button>
        </aside>
      </div>

      <Dialog
        open={flagOpen}
        title={t(`${report.ref}-ийг мэдэгдэх үү?`, `Flag ${report.ref}?`)}
        onClose={() => setFlagOpen(false)}
        actions={
          <>
            <Button data-autofocus onClick={() => setFlagOpen(false)}>
              {t("Болих", "Cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                const res = await act.flagReport(report.id, flagReason, flagDetails);
                setFlagOpen(false);
                if (!res.ok) toast({ tone: "danger", title: errorText(res.error) });
                else
                  toast({
                    tone: "success",
                    title: t("Мэдэгдлийг хүлээн авлаа", "Flag received"),
                    body: res.autoHidden
                      ? t("3 хүн мэдэгдсэн тул хяналтын шалгалт хүртэл түр нуулаа.", "Three people flagged it, so it's hidden until a moderator reviews it.")
                      : t("Админ шалгах болно.", "An admin will review it."),
                  });
              }}
            >
              {t("Мэдэгдэх", "Flag report")}
            </Button>
          </>
        }
      >
        <p>{t("Админ шалгаж, шаардлагатай бол нууна. Таны нэр харагдахгүй.", "An admin will review it and hide it if needed. Your name is never shown.")}</p>
        <div className="mt-4 space-y-3 text-ink">
          <Select
            label={t("Шалтгаан", "Reason")}
            value={flagReason}
            onChange={(v) => setFlagReason(v as FlagReason)}
            options={(Object.keys(FLAG_REASON_LABEL) as FlagReason[]).map((k) => ({ value: k, label: pick(FLAG_REASON_LABEL[k]) }))}
          />
          <TextField label={t("Нэмэлт тайлбар", "Details")} optional value={flagDetails} onChange={setFlagDetails} maxLength={500} />
        </div>
      </Dialog>
    </div>
  );
}
