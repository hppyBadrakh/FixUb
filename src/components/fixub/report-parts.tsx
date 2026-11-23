"use client";

import { forwardRef } from "react";
import { ArrowRight, CircleCheck, CircleX, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { tally } from "@/lib/domain/rules";
import { placeOf, reportTitle } from "@/lib/domain/metrics";
import { formatDateTime, formatDistance, timeAgo } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { CLOSURE_LABEL, DISTRICT_META, LIMITS, STATUS_META } from "@/lib/meta";
import { useStore } from "@/lib/store";
import type { AppState, Report, StatusTimelineEvent, TimelineEvent } from "@/lib/types";
import { NoPhoto, Photo } from "./photo";
import { CategoryTag, PriorityBadge, StatusBadge } from "./status";

/* ---------- ReportCard ---------- */

export const ReportCard = forwardRef<
  HTMLButtonElement,
  {
    report: Report;
    now: number;
    selected?: boolean;
    fresh?: boolean;
    onOpen: (id: string) => void;
    showStatus?: boolean;
    extra?: React.ReactNode;
  }
>(function ReportCard({ report, now, selected, fresh, onOpen, showStatus = true, extra }, ref) {
  const { lang, t, pick } = useT();
  const { catalog } = useStore();
  return (
    <button
      ref={ref}
      type="button"
      aria-current={selected || undefined}
      onClick={() => onOpen(report.id)}
      className={cn(
        "flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors duration-[140ms]",
        selected ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-line-strong",
        fresh && "fx-fresh",
      )}
    >
      {report.photoIds[0] ? (
        <Photo
          id={report.photoIds[0]}
          alt=""
          category={report.category}
          className="size-16 shrink-0 rounded-sm"
        />
      ) : (
        <NoPhoto category={report.category} className="size-16 shrink-0 rounded-sm" />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {showStatus && <StatusBadge status={report.status} reason={report.closureReason} />}
          {showStatus && report.status !== "closed" && <PriorityBadge priority={report.priority} />}
          <CategoryTag category={report.category} />
        </span>
        <span className="mt-1 line-clamp-2 block text-label font-[600] text-ink">{reportTitle(report, lang, catalog)}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-caption text-ink-subtle">
          <span>{pick(DISTRICT_META[report.district].label)}</span>
          <span title={formatDateTime(report.createdAt, lang)}>
            {t("Мэдээлсэн", "Reported")} {timeAgo(report.createdAt, now, lang)}
          </span>
          {report.confirmations.length > 0 && (
            <span className="inline-flex items-center gap-1" title={t("Надад ч бас", "Me too")}>
              <Users aria-hidden className="size-3.5" />
              <span className="tnum">{report.confirmations.length}</span>
              <span className="sr-only">{t("хүн бас харсан", "people also see this")}</span>
            </span>
          )}
        </span>
        {extra}
      </span>
    </button>
  );
});

/* ---------- StatusTimeline ---------- */

function eventTitle(e: TimelineEvent, state: AppState, t: (mn: string, en: string) => string, pick: (b: { mn: string; en: string }) => string) {
  if (e.type === "assigned") {
    const org = state.organizations.find((o) => o.id === e.organizationId);
    const unit = org?.units.find((u) => u.id === e.unitId);
    const who = org ? pick(org.name) + (unit ? ` · ${pick(unit.name)}` : "") : "—";
    return t(`Хариуцагчид шилжүүлсэн: ${who}`, `Assigned to ${who}`);
  }
  if (e.from === null) return t("Иргэн мэдээлсэн", "Reported by a citizen");
  if (e.to === "closed" && e.reason === "duplicate") return t("Давхардсан тул хаасан", "Closed as duplicate");
  if (e.to === "closed" && e.reason) return t(`Хаасан · ${CLOSURE_LABEL[e.reason].mn}`, `Closed · ${CLOSURE_LABEL[e.reason].en}`);
  if (e.from === "resolved" || e.from === "closed")
    return t(`Дахин нээсэн — ${STATUS_META[e.to].label.mn}`, `Reopened — ${STATUS_META[e.to].label.en}`);
  return t(`${STATUS_META[e.to].label.mn} төлөвт шилжсэн`, `Moved to ${STATUS_META[e.to].label.en}`);
}

const dotTone: Record<string, string> = {
  reported: "bg-[var(--status-reported-soft)] text-[var(--status-reported-text)]",
  investigating: "bg-[var(--status-investigating-soft)] text-[var(--status-investigating-text)]",
  in_progress: "bg-[var(--status-in-progress-soft)] text-[var(--status-in-progress-text)]",
  resolved: "bg-[var(--status-resolved-soft)] text-[var(--status-resolved-text)]",
  closed: "bg-[var(--status-closed-soft)] text-[var(--status-closed-text)]",
};

export function StatusTimeline({
  report,
  state,
  next,
}: {
  report: Report;
  state: AppState;
  next?: { title: string; detail?: string };
}) {
  const { lang, t, pick } = useT();
  return (
    <ol className="relative">
      {report.timeline.map((e, i) => {
        const isStatus = e.type === "status";
        const meta = isStatus ? STATUS_META[e.to] : null;
        const Icon = meta?.icon ?? ArrowRight;
        const last = i === report.timeline.length - 1 && !next;
        return (
          <li key={e.id} className="relative flex gap-3 pb-5">
            {!last && <span aria-hidden className="absolute left-[13px] top-7 bottom-0 w-px bg-line" />}
            <span
              className={cn(
                "relative grid size-7 shrink-0 place-items-center rounded-full",
                isStatus ? dotTone[e.to] : "bg-surface-sunken text-ink-muted",
              )}
            >
              <Icon aria-hidden className="size-4" strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-label font-[600]">{eventTitle(e, state, t, pick)}</p>
              <p className="text-caption text-ink-subtle">
                <time dateTime={new Date(e.at).toISOString()}>{formatDateTime(e.at, lang)}</time> · {pick(e.actorLabel)}
              </p>
              {isStatus && (e as StatusTimelineEvent).note && (
                <div className="mt-2 max-w-[68ch] rounded-sm bg-surface-sunken px-3 py-2">
                  <p className="text-eyebrow font-[650] uppercase tracking-wide text-ink-subtle">
                    {t("Олон нийтэд харагдах тэмдэглэл", "Public note")}
                  </p>
                  <p className="text-small text-ink">{(e as StatusTimelineEvent).note}</p>
                </div>
              )}
              {isStatus && (e as StatusTimelineEvent).photoId && (
                <Photo
                  id={(e as StatusTimelineEvent).photoId!}
                  alt={t("Засварын дараах зураг", "Photo after the repair")}
                  className="mt-2 h-40 w-full max-w-xs rounded-md"
                />
              )}
            </div>
          </li>
        );
      })}
      {next && (
        <li className="relative flex gap-3">
          <span aria-hidden className="size-7 shrink-0 rounded-full border-2 border-dashed border-line-strong" />
          <div className="pt-0.5">
            <p className="text-label font-[600] text-ink-muted">
              {t("Дараагийн алхам", "Next")}: {next.title}
            </p>
            {next.detail && <p className="text-caption text-ink-subtle">{next.detail}</p>}
          </div>
        </li>
      )}
    </ol>
  );
}

/* ---------- CitizenSignals ---------- */

export function CitizenSignals({
  report,
  userId,
  signedIn,
  onMeToo,
  onVerdict,
  onSignIn,
}: {
  report: Report;
  userId: string | null;
  signedIn: boolean;
  onMeToo: () => void;
  onVerdict: (v: "fixed" | "not_fixed" | null) => void;
  onSignIn: () => void;
}) {
  const { t } = useT();
  const isReporter = !!userId && report.reporterId === userId;
  if (report.status === "closed") return null;

  if (report.status === "resolved") {
    const { fixed, notFixed } = tally(report.feedback);
    const mine = report.feedback.find((f) => f.userId === userId)?.verdict;
    return (
      <div className="rounded-md border border-line bg-surface p-4">
        <p className="text-title-3 font-[600]">{t("Үнэхээр зассан уу?", "Is it actually fixed?")}</p>
        <p className="mt-1 text-small text-ink-muted">
          {t(
            "Байгууллага шийдвэрлэсэн гэж тэмдэглэсэн. Таны хариулт тоогоор олон нийтэд харагдана; албан ёсны төлөвийг өөрчлөхгүй.",
            "The organization marked this resolved. Your answer is shown publicly as a count; it does not change the official status.",
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            icon={CircleCheck}
            pressed={mine === "fixed"}
            disabled={!signedIn}
            onClick={() => onVerdict(mine === "fixed" ? null : "fixed")}
          >
            {t("Зассан", "Fixed")}
          </Button>
          <Button
            icon={CircleX}
            pressed={mine === "not_fixed"}
            disabled={!signedIn}
            onClick={() => onVerdict(mine === "not_fixed" ? null : "not_fixed")}
          >
            {t("Засаагүй хэвээр", "Still broken")}
          </Button>
        </div>
        <p className="mt-3 text-small" aria-live="polite">
          <b className="text-metric tnum font-[600]">{fixed}</b> {t("зассан гэсэн", "say fixed")}
          <span className="mx-2 text-ink-subtle">·</span>
          <b className={cn("text-metric tnum font-[600]", notFixed > fixed && "text-warning")}>{notFixed}</b>{" "}
          {t("засаагүй гэсэн", "say still broken")}
        </p>
        {!signedIn && <SignInHint onSignIn={onSignIn} />}
      </div>
    );
  }

  const mine = !!userId && report.confirmations.includes(userId);
  return (
    <div className="rounded-md border border-line bg-surface p-4">
      <p className="text-title-3 font-[600]">{t("Та ч бас харсан уу?", "Seeing the same problem?")}</p>
      <p className="mt-2 text-small" aria-live="polite">
        <b className="text-metric tnum font-[600]">{report.confirmations.length}</b>{" "}
        {t("хүн бас харсан", "people also see this")}
      </p>
      <Button
        className="mt-3"
        icon={Users}
        pressed={mine}
        disabled={!signedIn || isReporter}
        onClick={onMeToo}
      >
        {mine ? t("Та нэмэгдсэн", "You added yourself") : t("Надад ч бас", "Me too")}
      </Button>
      <p className="mt-2 text-caption text-ink-subtle">
        {isReporter
          ? t("Энэ таны мэдээлэл тул нэмэх шаардлагагүй.", "This is your report, so you're already counted.")
          : t(
              "Баталгаажуулалт нь байгууллагад нөлөөг харуулна. Нэг хүн нэг удаа.",
              "Confirmations help the organization see impact. One per person.",
            )}
      </p>
      {!signedIn && <SignInHint onSignIn={onSignIn} />}
    </div>
  );
}

function SignInHint({ onSignIn }: { onSignIn: () => void }) {
  const { t } = useT();
  return (
    <p className="mt-2 text-small text-ink-muted">
      <button type="button" onClick={onSignIn} className="font-[600] text-brand underline underline-offset-2">
        {t("Нэвтэрч", "Sign in")}
      </button>{" "}
      {t("хариулна уу.", "to respond.")}
    </p>
  );
}

/* ---------- DuplicateHint ---------- */

export function DuplicateHint({
  candidates,
  now,
  onConfirm,
  onContinue,
  confirmedId,
}: {
  candidates: { report: Report; distance: number }[];
  now: number;
  onConfirm: (id: string) => void;
  onContinue: () => void;
  confirmedId?: string | null;
}) {
  const { lang, t } = useT();
  return (
    <div className="rounded-md border border-line bg-surface p-4">
      <p className="text-title-3 font-[600]">
        {t(
          `Ойролцоо ${candidates.length} ижил төстэй нээлттэй мэдээлэл байна (${LIMITS.duplicateRadiusM} м дотор)`,
          `${candidates.length} open report${candidates.length > 1 ? "s" : ""} like this within ${LIMITS.duplicateRadiusM} m`,
        )}
      </p>
      <p className="mt-1 text-small text-ink-muted">
        {t(
          "Аль нэг нь таны асуудал бол “Надад ч бас” дарна уу — адилхан тоологдох ба давхардлаас сэргийлнэ.",
          "If one of these is your problem, add a “me too” instead — it counts the same and avoids a duplicate.",
        )}
      </p>
      <ul className="mt-3 divide-y divide-line">
        {candidates.map(({ report, distance }) => {
          const done = confirmedId === report.id;
          return (
            <li key={report.id} className="flex items-center gap-3 py-3">
              <NoPhoto category={report.category} className="size-12 shrink-0 rounded-sm" />
              <div className="min-w-0 flex-1">
                <p className="text-label font-[600]">{placeOf(report, lang)}</p>
                <p className="text-caption text-ink-subtle">
                  {formatDistance(distance, lang)} · {timeAgo(report.createdAt, now, lang)} ·{" "}
                  {report.confirmations.length} {t("хүн", "me too")}
                </p>
                <StatusBadge status={report.status} className="mt-1" />
              </div>
              <Button size="sm" icon={Users} disabled={done} onClick={() => onConfirm(report.id)}>
                {done ? t("Нэмэгдсэн", "Added") : t("Надад ч бас", "Me too")}
              </Button>
            </li>
          );
        })}
      </ul>
      <Button variant="quiet" iconEnd={ArrowRight} className="mt-1 -ml-2" onClick={onContinue}>
        {t("Аль нь ч биш — шинээр мэдээлэх", "None of these — continue with a new report")}
      </Button>
    </div>
  );
}

/* ---------- Stepper ---------- */

export function Stepper({ step, total, label }: { step: number; total: number; label: string }) {
  const { t } = useT();
  return (
    <div>
      <p className="text-small text-ink-muted" aria-live="polite">
        {t(`Алхам ${step}/${total}`, `Step ${step} of ${total}`)} · <b className="font-[600] text-ink">{label}</b>
      </p>
      <div className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${total}, 1fr)` }} aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn("h-1 rounded-full transition-colors duration-[260ms]", i < step ? "bg-brand" : "bg-line")}
          />
        ))}
      </div>
    </div>
  );
}

/* ---------- Meta list ---------- */

export function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 py-1.5 text-small">
      <dt className="text-ink-subtle">{label}</dt>
      <dd className="min-w-0 font-[500] text-ink">{children}</dd>
    </div>
  );
}
