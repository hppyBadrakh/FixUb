"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Camera, Eye, EyeOff, Flag, Gauge, RotateCcw, Save, SearchX, TriangleAlert, Users, ExternalLink, Send } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Banner, EmptyState, PageSkeleton, SampleDataPill, useToast } from "@/components/ui/feedback";
import { Select, TextField } from "@/components/ui/form";
import { Card, Dialog, Sheet } from "@/components/ui/overlay";
import { CameraCapture } from "@/components/fixub/camera";
import { NoPhoto, Photo } from "@/components/fixub/photo";
import { MetaRow, StatusTimeline } from "@/components/fixub/report-parts";
import { ReportMap } from "@/components/fixub/report-map";
import { CategoryTag, PriorityBadge, StatusBadge } from "@/components/fixub/status";
import { assignReport, changeStatus, moderate, restoreSnapshot, setPriority, suggestedOrganization, tally, type ActionError } from "@/lib/domain/actions";
import { distanceM } from "@/lib/domain/geo";
import { canWorkOn, transitionOptions } from "@/lib/domain/lifecycle";
import { descriptionOf, placeOf, reportTitle } from "@/lib/domain/metrics";
import { putPhoto } from "@/lib/data/photoStore";
import { formatDateTime, timeAgo } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { CLOSURE_LABEL, DISTRICT_META, FLAG_REASON_LABEL, PRIORITY_META, PRIORITY_ORDER, STATUS_META } from "@/lib/meta";
import { useNow, useStore } from "@/lib/store";
import type { ClosureReason, Priority, ReportStatus } from "@/lib/types";

export function ConsoleReport({ area }: { area: "admin" | "staff" }) {
  const { id } = useParams<{ id: string }>();
  const { ready, state, user, run, freshIds, catalog } = useStore();
  const { lang, t, pick } = useT();
  const toast = useToast();
  const now = useNow();
  const report = state.reports.find((r) => r.id === id);
  const back = area === "admin" ? "/admin/reports" : "/staff";

  // Assignment form (admin)
  const suggestion = report ? suggestedOrganization(state, report.category) : undefined;
  const [orgId, setOrgId] = useState("");
  const [unitId, setUnitId] = useState("");
  // Status form
  const [to, setTo] = useState<ReportStatus | "">("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState<ClosureReason>("duplicate");
  const [dupId, setDupId] = useState("");
  // Completion photo, captured with the camera (no gallery).
  const [completionPhoto, setCompletionPhoto] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  // Priority form (admin)
  const [priorityChoice, setPriorityChoice] = useState<Priority | null>(null);
  const [priorityNote, setPriorityNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  // The version the user is looking at; a save against an older version is a 409 conflict.
  const [seenVersion, setSeenVersion] = useState<number | null>(null);
  const [hideOpen, setHideOpen] = useState(false);

  useEffect(() => {
    if (!report) return;
    /* eslint-disable react-hooks/set-state-in-effect -- initialise the forms once the record is loaded */
    if (seenVersion === null) setSeenVersion(report.version);
    if (!orgId) {
      setOrgId(report.organizationId ?? suggestion?.id ?? "");
      setUnitId(report.unitId ?? "");
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [report, seenVersion, orgId, suggestion?.id]);

  const dupCandidates = useMemo(() => {
    if (!report) return [];
    return state.reports
      .filter((r) => r.id !== report.id && r.visibility === "visible" && r.status !== "closed" && r.category === report.category)
      .map((r) => ({ r, d: distanceM(report, r) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 8);
  }, [report, state.reports]);

  if (!ready) return <PageSkeleton />;
  if (!report || !user || (area === "staff" && !canWorkOn(user, report))) {
    return (
      <EmptyState
        className="py-24"
        icon={SearchX}
        title={t("Ийм мэдээлэл байхгүй эсвэл танд харагдахгүй", "This report doesn't exist or isn't visible to you")}
        action={<ButtonLink href={back}>{t("Дараалал руу буцах", "Back to the queue")}</ButtonLink>}
      />
    );
  }

  const options = transitionOptions(user, report);
  const org = state.organizations.find((o) => o.id === report.organizationId);
  const unit = org?.units.find((u) => u.id === report.unitId);
  const formOrg = state.organizations.find((o) => o.id === orgId);
  const { fixed, notFixed } = tally(report.feedback);
  const openFlags = report.flags.filter((f) => f.status === "open");
  const reopening = report.status === "resolved" || report.status === "closed";
  const stale = seenVersion !== null && seenVersion !== report.version;

  const errorText = (e: ActionError) =>
    ({
      note_required: t("Дахин нээхэд олон нийтэд харагдах тэмдэглэл заавал бичнэ.", "A public note is required to reopen a report."),
      reason_required: t("Хаах шалтгааныг сонгоно уу.", "Choose a reason for closing."),
      duplicate_required: t("Давхардсан бол үндсэн мэдээллийг сонгоно уу (нээлттэй, харагдах).", "For a duplicate, choose the original report (open and visible)."),
      invalid_transition: t("Энэ төлөвт шилжүүлэх боломжгүй.", "That status change isn't allowed."),
      not_found: t("Танд энэ үйлдлийг хийх эрх алга.", "You don't have permission for this change."),
      forbidden: t("Танд энэ үйлдлийг хийх эрх алга.", "You don't have permission for this change."),
    })[e as string] ?? t("Хадгалж чадсангүй.", "Couldn't save.");

  const savePriority = () => {
    const chosen = priorityChoice ?? report.priority;
    if (!chosen) return;
    const res = run((s, u, n) => setPriority(s, u, report.id, chosen, priorityNote, n));
    if (!res.ok) {
      toast({ tone: "danger", title: t("Хадгалж чадсангүй", "Couldn't save the priority") });
      return;
    }
    setPriorityChoice(null);
    setPriorityNote("");
    toast({
      tone: "success",
      title: t("Ач холбогдлыг тогтоолоо", "Priority set"),
      body: t(`${report.ref}: ${PRIORITY_META[chosen].label.mn}`, `${report.ref} is now ${PRIORITY_META[chosen].label.en}.`),
    });
  };

  const saveStatus = () => {
    if (!to) {
      setFormError(t("Шинэ төлөвийг сонгоно уу.", "Choose the new status."));
      return;
    }
    setSaving(true);
    setFormError(null);
    // Status changes wait for the "server" (no optimistic update) because of the version lock.
    setTimeout(() => {
      const res = run((s, u, n) =>
        changeStatus(
          s,
          u,
          report.id,
          {
            to,
            note,
            closureReason: to === "closed" ? reason : undefined,
            duplicateOfId: to === "closed" && reason === "duplicate" ? dupId : undefined,
            photoId: to === "resolved" ? (completionPhoto ?? undefined) : undefined,
            expectedVersion: seenVersion ?? report.version,
          },
          n,
        ),
      );
      setSaving(false);
      if (!res.ok) {
        if (res.error === "conflict") {
          setConflict(true);
          setSeenVersion(report.version);
        } else setFormError(errorText(res.error));
        return;
      }
      toast({
        tone: "success",
        title: t("Төлөв шинэчлэгдлээ", "Status updated"),
        body: t(`${report.ref} одоо: ${STATUS_META[to].label.mn}.`, `${report.ref} is now ${STATUS_META[to].label.en}.`),
      });
      setSeenVersion(report.version + 1);
      // Only clear what was saved, in case the form was edited while saving.
      const savedNote = note;
      setTo((cur) => (cur === to ? "" : cur));
      setNote((cur) => (cur === savedNote ? "" : cur));
      setCompletionPhoto(null);
      setConflict(false);
    }, 450);
  };

  const assign = () => {
    if (!orgId) return;
    const res = run((s, u, n) => assignReport(s, u, report.id, orgId, unitId || undefined, n));
    if (!res.ok) {
      toast({ tone: "danger", title: t("Хуваарилж чадсангүй", "Couldn't assign") });
      return;
    }
    setSeenVersion(report.version + 1);
    const o = state.organizations.find((x) => x.id === orgId);
    const un = o?.units.find((x) => x.id === unitId);
    toast({
      tone: "success",
      title: t("Хуваарилагдлаа", "Assigned"),
      body: `${report.ref} → ${o ? pick(o.name) : ""}${un ? ` · ${pick(un.name)}` : ""}`,
    });
  };

  const moderateNow = (action: "hide" | "restore" | "dismiss") => {
    const snapshot = report;
    const res = run((s, u, n) => moderate(s, u, report.id, action, n));
    if (!res.ok) return;
    toast({
      tone: "success",
      title:
        action === "hide"
          ? t(`${report.ref}-ийг нууллаа`, `${report.ref} hidden`)
          : action === "restore"
            ? t(`${report.ref}-ийг сэргээлээ`, `${report.ref} restored`)
            : t("Мэдэгдлийг хаалаа", "Flags dismissed"),
      body: t("Аудитын бүртгэлд орлоо.", "Recorded in the audit log."),
      action: { label: t("Буцаах", "Undo"), onClick: () => run((s, u) => restoreSnapshot(s, u, snapshot)) },
    });
  };

  const assigned = !!report.organizationId;
  const statusPrimary = area === "staff" || assigned;

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 md:px-6 lg:px-8">
      <Link href={back} className="inline-flex items-center gap-1 text-small font-[600] text-brand hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> {area === "admin" ? t("Мэдээллүүд", "Reports") : t("Ажлын дараалал", "Work queue")}
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-title-3 font-[650] tnum">{report.ref}</span>
        <StatusBadge status={report.status} reason={report.closureReason} size="lg" />
        <PriorityBadge priority={report.priority} className="py-1 text-small" />
        <CategoryTag category={report.category} subcategory={report.subcategory} boxed className="text-small" />
        {report.visibility === "hidden" && (
          <span className="inline-flex items-center gap-1 rounded-xs bg-danger-soft px-2 py-1 text-caption font-[600] text-danger">
            <EyeOff aria-hidden className="size-3.5" /> {t("Олон нийтээс нуусан", "Hidden from public")}
          </span>
        )}
        <SampleDataPill />
      </div>
      <h1 className="mt-1 text-title-1 font-[650] tracking-tight">{reportTitle(report, lang, catalog)}</h1>
      <p className="mt-1 text-small text-ink-subtle">
        {t("Мэдээлсэн", "Reported")} {formatDateTime(report.createdAt, lang)} ({timeAgo(report.createdAt, now, lang)}) ·{" "}
        {pick(DISTRICT_META[report.district].label)} ·{" "}
        <Link href={`/reports/${report.id}`} className="inline-flex items-center gap-1 font-[600] text-brand hover:underline">
          {t("Олон нийтийн хуудас", "Public page")} <ExternalLink aria-hidden className="size-3.5" />
        </Link>
      </p>

      {notFixed > fixed && report.status === "resolved" && (
        <Banner tone="warning" className="mt-4" icon={TriangleAlert} title={t("Иргэд эсэргүүцэж байна", "Disputed by citizens")}>
          {t(
            `${notFixed} хүн засаагүй, ${fixed} хүн зассан гэж хариулсан. Шаардлагатай бол менежер дахин нээнэ үү (тэмдэглэл заавал).`,
            `${notFixed} say still broken, ${fixed} say fixed. A manager should consider reopening it (a public note is required).`,
          )}
        </Banner>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          <Card title={t("Иргэний тайлбар", "Citizen's description")} subtitle={t("Баталгаажаагүй", "Not yet verified")}>
            <p className="max-w-[68ch] whitespace-pre-line text-body-lg">{descriptionOf(report, lang)}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 sm:max-w-md">
              {report.photoIds.length ? (
                report.photoIds.map((pid, i) => (
                  <Photo key={pid} id={pid} alt={t(`Зураг ${i + 1}`, `Photo ${i + 1}`)} className="aspect-square w-full rounded-md" />
                ))
              ) : (
                <NoPhoto category={report.category} className="aspect-square rounded-md" />
              )}
            </div>
            <dl className="mt-4 border-t border-line pt-3">
              <MetaRow label={t("Байршил", "Location")}>
                {placeOf(report, lang)} · <span className="tnum">{report.lat.toFixed(5)}, {report.lng.toFixed(5)}</span>
                {report.accuracyM ? ` · ± ${report.accuracyM} m` : ""}
              </MetaRow>
              <MetaRow label={t("Иргэдийн дохио", "Citizen signals")}>
                <span className="inline-flex items-center gap-1">
                  <Users aria-hidden className="size-4" /> {report.confirmations.length} {t("хүн бас харсан", "me too")}
                </span>
                {report.status === "resolved" && (
                  <span className={notFixed > fixed ? "ml-3 font-[650] text-warning" : "ml-3"}>
                    {fixed} {t("зассан", "fixed")} · {notFixed} {t("засаагүй", "still broken")}
                  </span>
                )}
              </MetaRow>
            </dl>
          </Card>

          <Card title={t("Явц", "Progress")} subtitle={t("Олон нийтэд харагдах түүх", "Public history")}>
            <div className={freshIds.has(report.id) ? "fx-fresh rounded-md" : undefined}>
              <StatusTimeline report={report} state={state} />
            </div>
          </Card>

          {area === "admin" && report.flags.length > 0 && (
            <Card title={t("Мэдэгдлүүд", "Flags")} subtitle={t("Иргэдийн мэдэгдэл", "Raised by citizens")}>
              <ul className="space-y-2">
                {report.flags.map((f) => (
                  <li key={f.id} className="flex items-start gap-2 text-small">
                    <Flag aria-hidden className="mt-0.5 size-4 text-danger" />
                    <span className="flex-1">
                      {pick(FLAG_REASON_LABEL[f.reason])}
                      {f.details && <span className="text-ink-muted"> — {f.details}</span>}
                    </span>
                    <span className="text-caption text-ink-subtle">
                      {f.status === "open" ? t("Нээлттэй", "Open") : f.status === "actioned" ? t("Арга хэмжээ авсан", "Actioned") : t("Хаасан", "Dismissed")}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <aside className="min-w-0 space-y-6">
          {area === "admin" ? (
            <Card
              title={
                <span className="flex items-center gap-2">
                  {t("Ач холбогдол", "Priority")} <PriorityBadge priority={report.priority} />
                </span>
              }
              subtitle={t("Зөвхөн FixUB админ тогтооно. Иргэн сонгодоггүй.", "Set by FixUB admins only. Citizens never choose it.")}
            >
              {!report.priority && (
                <Banner tone="warning" className="mb-3" title={t("Ач холбогдол тогтоогоогүй", "Awaiting priority")}>
                  {t("Зураг, байршил, тайлбарыг шалгаад тогтооно уу.", "Review the photo, location and description, then set it.")}
                </Banner>
              )}
              <fieldset>
                <legend className="sr-only">{t("Ач холбогдол сонгох", "Choose priority")}</legend>
                <div className="grid grid-cols-2 gap-2">
                  {PRIORITY_ORDER.map((p) => {
                    const current = (priorityChoice ?? report.priority) === p;
                    return (
                      <Button key={p} size="sm" pressed={current} onClick={() => setPriorityChoice(p)}>
                        {pick(PRIORITY_META[p].label)}
                      </Button>
                    );
                  })}
                </div>
              </fieldset>
              <TextField
                className="mt-3"
                multiline
                rows={2}
                optional
                label={t("Дотоод тэмдэглэл", "Internal note")}
                hint={t("Яагаад энэ ач холбогдол вэ. Олон нийтэд харагдахгүй.", "Why this priority. Not shown publicly.")}
                value={priorityNote}
                onChange={setPriorityNote}
                maxLength={300}
              />
              <Button
                className="mt-3"
                fullWidth
                icon={Gauge}
                variant={report.priority ? "secondary" : "primary"}
                disabled={!priorityChoice || (priorityChoice === report.priority && !priorityNote.trim())}
                onClick={savePriority}
              >
                {report.priority ? t("Ач холбогдлыг өөрчлөх", "Change priority") : t("Ач холбогдол тогтоох", "Set priority")}
              </Button>
              {report.priorityDecision && (
                <p className="mt-3 text-caption text-ink-subtle">
                  {t("Тогтоосон", "Set by")} {report.priorityDecision.by} · {formatDateTime(report.priorityDecision.at, lang)}
                  {report.priorityDecision.note && (
                    <span className="mt-1 block rounded-sm bg-surface-sunken px-2 py-1.5 text-ink-muted">
                      <b className="font-[600]">{t("Дотоод тэмдэглэл:", "Internal note:")}</b> {report.priorityDecision.note}
                    </span>
                  )}
                </p>
              )}
            </Card>
          ) : (
            <Card title={t("Ач холбогдол", "Priority")}>
              <PriorityBadge priority={report.priority} className="py-1 text-small" />
              <p className="mt-2 text-small text-ink-muted">
                {report.priority
                  ? t("FixUB баг тогтоосон. Өөрчлөх шаардлагатай бол админд хандана уу.", "Set by the FixUB team. Ask an admin if it should change.")
                  : t("FixUB баг хараахан тогтоогоогүй.", "The FixUB team hasn't set it yet.")}
              </p>
              {report.priorityDecision?.note && (
                <p className="mt-2 rounded-sm bg-surface-sunken px-2 py-1.5 text-caption text-ink-muted">
                  <b className="font-[600]">{t("Дотоод тэмдэглэл:", "Internal note:")}</b> {report.priorityDecision.note}
                </p>
              )}
            </Card>
          )}

          {area === "admin" && (
            <Card title={t("Хуваарилалт", "Assignment")} subtitle={t("Хариуцах байгууллага ба баг", "Responsible organization and unit")}>
              {assigned ? (
                <p className="mb-3 text-small">
                  {t("Одоо:", "Now:")} <b>{org ? pick(org.name) : "—"}</b>
                  {unit && ` · ${pick(unit.name)}`}
                </p>
              ) : (
                <Banner tone="warning" className="mb-3" title={t("Хуваарилаагүй", "Not assigned yet")}>
                  {suggestion
                    ? t(`Ангиллаар санал болгож буй: ${suggestion.name.mn}`, `Suggested by category routing: ${suggestion.name.en}`)
                    : t("Энэ ангилалд анхдагч байгууллага алга.", "No default organization for this category.")}
                </Banner>
              )}
              <div className="space-y-3">
                <Select
                  label={t("Байгууллага", "Organization")}
                  value={orgId}
                  onChange={(v) => {
                    setOrgId(v);
                    setUnitId("");
                  }}
                  options={[
                    { value: "", label: t("Байгууллага сонгох", "Choose organization") },
                    ...state.organizations.map((o) => ({
                      value: o.id,
                      label: `${pick(o.name)}${o.id === suggestion?.id ? t(" · санал болгосон", " · suggested") : ""}${o.isActive ? "" : t(" (идэвхгүй)", " (inactive)")}`,
                      disabled: !o.isActive,
                    })),
                  ]}
                />
                <Select
                  label={t("Засварын баг", "Repair unit")}
                  value={unitId}
                  onChange={setUnitId}
                  options={[
                    { value: "", label: t("Баг сонгоогүй (байгууллага хуваарилна)", "No unit (organization decides)") },
                    ...(formOrg?.units ?? []).map((u) => ({ value: u.id, label: pick(u.name) })),
                  ]}
                />
                <Button
                  variant={assigned ? "secondary" : "primary"}
                  icon={Send}
                  disabled={!orgId || (orgId === report.organizationId && (unitId || undefined) === report.unitId)}
                  onClick={assign}
                  fullWidth
                >
                  {assigned ? t("Дахин хуваарилах", "Reassign") : t("Хуваарилах", "Assign")}
                </Button>
              </div>
            </Card>
          )}

          <Card title={t("Төлөв өөрчлөх", "Change status")} subtitle={t("Зөвхөн зөвшөөрөгдсөн алхмууд харагдана", "Only allowed moves are listed")}>
            {conflict && (
              <Banner tone="danger" className="mb-3" title={t("Өөр хүн шинэчилсэн байна", "Someone else updated this report")}>
                {t("Одоогийн төлөвийг харуулж байна. Таны тэмдэглэл хадгалагдсан — шалгаад дахин хадгална уу.", "Here's the current status. Your note is kept — review and save again.")}
              </Banner>
            )}
            {stale && !conflict && (
              <Banner tone="info" className="mb-3" title={t("Энэ мэдээлэл шинэчлэгдсэн", "This report just changed")}>
                {t("Өөр таб эсвэл хэрэглэгч өөрчилсөн. Хадгалахаас өмнө шалгана уу.", "It was changed in another tab or by someone else. Check before saving.")}
              </Banner>
            )}
            {options.length === 0 ? (
              <p className="text-small text-ink-muted">
                {report.status === "closed"
                  ? t("Хаагдсан мэдээллийг зөвхөн админ дахин нээнэ.", "Only an admin can reopen a closed report.")
                  : t("Танд энэ мэдээллийн төлөвийг өөрчлөх алхам алга.", "There are no status changes available to you.")}
              </p>
            ) : (
              <div className="space-y-3">
                <Select
                  label={t("Шинэ төлөв", "New status")}
                  value={to}
                  onChange={(v) => {
                    setTo(v as ReportStatus);
                    setFormError(null);
                  }}
                  options={[
                    { value: "", label: t("Төлөв сонгох", "Choose status") },
                    ...options.map((o) => ({
                      value: o.to,
                      label:
                        (reopening ? t("Дахин нээх → ", "Reopen → ") : "") +
                        pick(STATUS_META[o.to].label) +
                        (o.managerOnly ? t(" (менежер)", " (manager)") : ""),
                      disabled: !o.allowed,
                    })),
                  ]}
                />
                {to === "closed" && (
                  <>
                    <Select
                      label={t("Хаах шалтгаан", "Reason")}
                      value={reason}
                      onChange={(v) => setReason(v as ClosureReason)}
                      options={(Object.keys(CLOSURE_LABEL) as ClosureReason[]).map((k) => ({ value: k, label: pick(CLOSURE_LABEL[k]) }))}
                    />
                    {reason === "duplicate" && (
                      <Select
                        label={t("Үндсэн мэдээлэл", "Original report")}
                        value={dupId}
                        onChange={setDupId}
                        options={[
                          { value: "", label: t("Сонгох", "Choose") },
                          ...dupCandidates.map(({ r, d }) => ({ value: r.id, label: `${r.ref} · ${placeOf(r, lang)} · ${Math.round(d)} m` })),
                        ]}
                      />
                    )}
                  </>
                )}
                <TextField
                  multiline
                  rows={3}
                  label={t("Олон нийтэд харагдах тэмдэглэл", "Public note")}
                  required={reopening}
                  optional={!reopening}
                  hint={t("Иргэд хуудсан дээр харна. Ажилтны нэр бүү бич.", "Citizens see this on the report page. Don't include staff names.")}
                  value={note}
                  onChange={setNote}
                  maxLength={500}
                />
                {to === "resolved" && (
                  <div>
                    <p className="text-label font-[550]">
                      {t("Гүйцэтгэлийн зураг", "Completion photo")}{" "}
                      <span className="font-normal text-ink-subtle">{t("Заавал биш", "Optional")}</span>
                    </p>
                    <p className="text-small text-ink-subtle">
                      {t("Засварын дараа газар дээр нь камераар авна. Иргэдэд итгэл төрүүлнэ.", "Take it on site after the repair. It helps citizens trust the result.")}
                    </p>
                    {completionPhoto ? (
                      <div className="relative mt-2">
                        <Photo id={completionPhoto} alt={t("Гүйцэтгэлийн зураг", "Completion photo")} className="aspect-[4/3] w-full rounded-md" />
                        <button
                          type="button"
                          onClick={() => setCameraOpen(true)}
                          className="absolute right-2 top-2 inline-flex h-9 items-center gap-1.5 rounded-full bg-black/60 px-3 text-caption font-[600] text-white"
                        >
                          <RotateCcw aria-hidden className="size-4" /> {t("Дахин авах", "Retake")}
                        </button>
                      </div>
                    ) : (
                      <Button className="mt-2" icon={Camera} fullWidth onClick={() => setCameraOpen(true)}>
                        {t("Камераар зураг авах", "Take photo with camera")}
                      </Button>
                    )}
                  </div>
                )}
                {formError && (
                  <p role="alert" className="text-small font-[550] text-danger">
                    {formError}
                  </p>
                )}
                <Button
                  variant={statusPrimary ? "primary" : "secondary"}
                  icon={Save}
                  loading={saving}
                  onClick={saveStatus}
                  fullWidth
                >
                  {saving ? t("Хадгалж байна…", "Saving…") : t("Төлөв хадгалах", "Save status")}
                </Button>
              </div>
            )}
          </Card>

          {area === "admin" && (
            <Card title={t("Хяналт", "Moderation")}>
              <p className="text-small text-ink-muted">
                {openFlags.length
                  ? t(`${openFlags.length} нээлттэй мэдэгдэл.`, `${openFlags.length} open flag${openFlags.length > 1 ? "s" : ""}.`)
                  : t("Нээлттэй мэдэгдэл алга.", "No open flags.")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {report.visibility === "visible" ? (
                  <Button variant="danger" icon={EyeOff} onClick={() => setHideOpen(true)}>
                    {t("Нуух", "Hide report")}
                  </Button>
                ) : (
                  <Button icon={Eye} onClick={() => moderateNow("restore")}>
                    {t("Сэргээх", "Restore")}
                  </Button>
                )}
                {openFlags.length > 0 && <Button onClick={() => moderateNow("dismiss")}>{t("Мэдэгдлийг хаах", "Dismiss flags")}</Button>}
              </div>
            </Card>
          )}

          <ReportMap
            mode="static"
            className="h-56 rounded-md border border-line"
            ariaLabel={t("Байршил", "Location")}
            reports={[report]}
            center={report}
            initialZoom={15.5}
            showLegend={false}
          />
        </aside>
      </div>

      <Sheet open={cameraOpen} title={t("Гүйцэтгэлийн зураг", "Completion photo")} onClose={() => setCameraOpen(false)}>
        {cameraOpen && (
          <CameraCapture
            className="aspect-[3/4] w-full sm:aspect-[4/3]"
            onCapture={async (blob) => {
              setCompletionPhoto(await putPhoto(blob));
              setCameraOpen(false);
            }}
          />
        )}
      </Sheet>

      <Dialog
        open={hideOpen}
        title={t(`${report.ref}-ийг нуух уу?`, `Hide ${report.ref}?`)}
        onClose={() => setHideOpen(false)}
        actions={
          <>
            <Button data-autofocus onClick={() => setHideOpen(false)}>
              {t("Болих", "Cancel")}
            </Button>
            <Button
              variant="danger"
              icon={EyeOff}
              onClick={() => {
                setHideOpen(false);
                moderateNow("hide");
              }}
            >
              {t("Нуух", "Hide report")}
            </Button>
          </>
        }
      >
        {t("Газрын зураг болон олон нийтийн хуудаснаас алга болно. Дараа нь сэргээж болно.", "It disappears from the map and public pages. You can restore it later.")}
      </Dialog>
    </div>
  );
}
