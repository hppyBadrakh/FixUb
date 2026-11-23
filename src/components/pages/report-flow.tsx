"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, CircleCheck, Hourglass, LogIn, MapPin, Pencil, RotateCcw, Search, Send, X } from "lucide-react";
import { Button, ButtonLink, IconButton } from "@/components/ui/button";
import { Banner, PageSkeleton, SampleDataPill, useToast } from "@/components/ui/feedback";
import { Select, TextField } from "@/components/ui/form";
import { CameraCapture } from "@/components/fixub/camera";
import { Photo } from "@/components/fixub/photo";
import { DuplicateHint, Stepper } from "@/components/fixub/report-parts";
import { ReportMap, type PickValue } from "@/components/fixub/report-map";
import { PriorityBadge, StatusBadge } from "@/components/fixub/status";
import { cn } from "@/lib/cn";
import { findDuplicateCandidates } from "@/lib/domain/actions";
import { uid } from "@/lib/id";
import { guessDistrict, inServiceArea } from "@/lib/domain/geo";
import { useT } from "@/lib/i18n";
import { DISTRICT_META, DISTRICT_ORDER, ICONS, LIMITS, STATUS_META } from "@/lib/meta";
import { useNearbyReports } from "@/lib/api/nearby";
import { searchPlaces } from "@/lib/places";
import { useNow, useStore } from "@/lib/store";
import type { DistrictId, Report } from "@/lib/types";

/** Photo → category & subcategory → location → description → review. */
type Step = 1 | 2 | 3 | 4 | 5;
const TOTAL = 5;

interface Draft {
  step: Step;
  photoIds: string[];
  category: string | null;
  subcategory: string | null;
  pick: PickValue | null;
  addressHint: string;
  district: DistrictId | null;
  description: string;
  clientRequestId: string;
}

const DRAFT_KEY = "fixub-report-draft-v2";

function emptyDraft(requestId = uid("req")): Draft {
  return {
    step: 1,
    photoIds: [],
    category: null,
    subcategory: null,
    pick: null,
    addressHint: "",
    district: null,
    description: "",
    clientRequestId: requestId,
  };
}

export function ReportFlow() {
  const { ready, state, user, act, catalog, server } = useStore();
  const { lang, t, pick: pickBi } = useT();
  const router = useRouter();
  const toast = useToast();
  const now = useNow();
  // The idempotency key is generated on the client (see the restore effect), not during prerender.
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(""));
  const [restored, setRestored] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [cameraOpen, setCameraOpen] = useState(true);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [confirmedDup, setConfirmedDup] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<Pick<Report, "id" | "ref"> | null>(null);
  const [placeQuery, setPlaceQuery] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const subRef = useRef<HTMLFieldSetElement>(null);

  // Entered data survives reloads and back-navigation (WCAG 3.3.7).
  useEffect(() => {
    let d: Draft | null = null;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      d = raw ? (JSON.parse(raw) as Draft) : null;
    } catch {}
    /* eslint-disable react-hooks/set-state-in-effect -- restore the saved draft after hydration */
    setDraft(d ?? emptyDraft());
    setCameraOpen(!d?.photoIds.length);
    setRestored(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  useEffect(() => {
    if (!restored || done) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {}
  }, [draft, restored, done]);

  useEffect(() => {
    if (draft.step !== 1) headingRef.current?.focus();
  }, [draft.step, showDuplicates, done]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const places = useMemo(() => searchPlaces(placeQuery), [placeQuery]);
  // With a database the server finds them (PostGIS, nearest five, own reports left out). Without
  // one, the demo does the same over the reports in this browser.
  const nearby = useNearbyReports(server.configured ? draft.pick : null, draft.category);
  const duplicates = useMemo(
    () =>
      server.configured
        ? nearby.candidates
        : draft.pick && draft.category
          ? findDuplicateCandidates(state, { ...draft.pick, category: draft.category }, now).filter((c) => c.report.reporterId !== user?.id)
          : [],
    [server.configured, nearby.candidates, state, draft.pick, draft.category, now, user?.id],
  );
  // Don't skip the hint because the answer is still on its way.
  const checkingNearby = draft.step === 3 && !showDuplicates && nearby.loading;

  const advance = () => {
    // After the location is confirmed, offer nearby open reports of the same kind (FR-004).
    if (draft.step === 3 && duplicates.length && !showDuplicates) {
      setShowDuplicates(true);
      return;
    }
    setShowDuplicates(false);
    set({ step: Math.min(TOTAL, draft.step + 1) as Step });
  };
  // "Continue" tapped while the server is still looking for nearby reports: carry on as soon as it answers.
  const [continueWhenReady, setContinueWhenReady] = useState(false);
  const advanceRef = useRef(advance);
  useEffect(() => {
    advanceRef.current = advance;
  });
  useEffect(() => {
    if (!continueWhenReady || checkingNearby) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the answer of the server arrives after the tap
    setContinueWhenReady(false);
    advanceRef.current();
  }, [continueWhenReady, checkingNearby]);

  if (!ready || !restored) return <PageSkeleton />;

  if (!user) {
    return (
      <FlowFrame title={t("Асуудал мэдээлэх", "Report a problem")} onClose={() => router.push("/")}>
        <div className="mx-auto max-w-[480px] px-4 py-12 text-center">
          <h1 className="text-title-2 font-[600]">{t("Мэдээлэхийн тулд нэвтэрнэ үү", "Sign in to report a problem")}</h1>
          <p className="mt-2 text-body text-ink-muted">
            {t(
              "Хариуцлагатай байдал, хог мэдээллээс сэргийлэхийн тулд нэвтрэх шаардлагатай. Таны нэр олон нийтэд хэзээ ч харагдахгүй.",
              "Signing in keeps reports accountable and limits spam. Your name is never shown publicly.",
            )}
          </p>
          <ButtonLink href="/login?next=/reports/new" variant="primary" size="lg" icon={LogIn} className="mt-6">
            {t("Демо иргэнээр нэвтрэх", "Sign in as a demo citizen")}
          </ButtonLink>
        </div>
      </FlowFrame>
    );
  }

  /* ---------- Confirmation ---------- */
  if (done) {
    return (
      <FlowFrame title={t("Асуудал мэдээлэх", "Report a problem")} onClose={() => router.push("/")}>
        <div className="mx-auto max-w-[480px] px-4 py-10">
          <span className="grid size-12 place-items-center rounded-full bg-success-soft text-success">
            <CircleCheck aria-hidden className="size-6" strokeWidth={1.75} />
          </span>
          <h1 ref={headingRef} tabIndex={-1} className="mt-4 text-title-1 font-[650] outline-none">
            {t("Таны мэдээлэл нийтлэгдлээ", "Your report is public now")}
          </h1>
          <p className="mt-2 text-body text-ink-muted">{t("Таны нэр хэзээ ч харагдахгүй.", "Your name is never shown.")}</p>
          <div className="mt-6 rounded-md border border-line bg-surface p-4">
            <p className="text-small text-ink-muted">{t("Хянах дугаар", "Tracking reference")}</p>
            <p className="text-metric font-[650] tnum">{done.ref}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge status="reported" />
              <PriorityBadge priority={null} />
            </div>
            <p className="mt-2 text-small text-ink-muted">{pickBi(STATUS_META.reported.publicMeaning)}</p>
            <p className="mt-3 text-small">
              <b>{t("Дараа нь", "What happens next")}:</b>{" "}
              {t(
                "FixUB баг хянаж, ач холбогдлыг тогтоон хариуцах байгууллагад шилжүүлнэ. Явцыг “Миний мэдээлэл” хэсгээс харна.",
                "The FixUB team reviews it, sets its priority and assigns it to the responsible organization. Follow it under “My reports”.",
              )}
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <ButtonLink href={`/reports/${done.id}`} variant="primary" size="lg" iconEnd={ArrowRight}>
              {t("Мэдээллээ харах", "View my report")}
            </ButtonLink>
            <Button
              size="lg"
              onClick={() => {
                setDraft(emptyDraft());
                setCameraOpen(true);
                setDone(null);
              }}
            >
              {t("Өөр асуудал мэдээлэх", "Report another")}
            </Button>
          </div>
        </div>
      </FlowFrame>
    );
  }

  /* ---------- Me too instead (from the duplicate hint) ---------- */
  const confirmDuplicate = async (id: string) => {
    const res = await act.toggleMeToo(id);
    if (!res.ok) {
      toast({ tone: "danger", title: t("Нэмж чадсангүй", "Couldn't add your “me too”") });
      return;
    }
    setConfirmedDup(id);
    sessionStorage.removeItem(DRAFT_KEY);
    toast({ tone: "success", title: t("Баталгаажуулалт нэмэгдлээ", "Confirmation added"), body: t("Шинэ мэдээлэл үүсгээгүй.", "No new report was created.") });
    router.push(`/reports/${id}`);
  };

  const category = draft.category ? catalog.get(draft.category) : undefined;

  const validate = (step: Step): boolean => {
    const e: Record<string, string> = {};
    if (step === 1 && !draft.photoIds.length)
      e.photo = t("Асуудлын зургийг камераар авна уу.", "Take a photo of the problem with the camera.");
    if (step === 2) {
      if (!draft.category) e.category = t("Үндсэн ангиллыг сонгоно уу.", "Choose a main category.");
      else if (!draft.subcategory) e.subcategory = t("Дэд ангиллыг сонгоно уу.", "Choose what exactly is wrong.");
    }
    if (step === 3) {
      if (!draft.pick) e.pick = t("Газрын зургийг хөдөлгөж байршлаа сонгоно уу.", "Move the map to choose the spot.");
      else if (!inServiceArea(draft.pick)) e.pick = t("Энэ цэг Улаанбаатараас гадна байна.", "This point is outside Ulaanbaatar.");
    }
    if (step === 4) {
      const n = draft.description.trim().length;
      if (n < LIMITS.descriptionMin)
        e.description = t(
          `Асуудлыг дор хаяж ${LIMITS.descriptionMin} тэмдэгтээр тайлбарлана уу (одоо ${n}).`,
          `Describe the problem in at least ${LIMITS.descriptionMin} characters (${n} so far).`,
        );
    }
    setErrors(e);
    if (e.subcategory) subRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    return Object.keys(e).length === 0;
  };

  const goNext = () => {
    if (!validate(draft.step)) return;
    if (checkingNearby) return setContinueWhenReady(true);
    advance();
  };
  const goBack = () => {
    setContinueWhenReady(false);
    setErrors({});
    if (showDuplicates) return setShowDuplicates(false);
    if (draft.step === 1) router.push("/");
    else set({ step: (draft.step - 1) as Step });
  };

  const onCapture = async (blob: Blob) => {
    let id: string;
    try {
      id = await act.savePhoto(blob);
    } catch {
      toast({
        tone: "danger",
        title: t("Зургийг хадгалж чадсангүй", "Couldn't save the photo"),
        body: t("Холболтоо шалгаад дахин авна уу.", "Check your connection and take it again."),
      });
      return;
    }
    setDraft((d) => ({ ...d, photoIds: [...d.photoIds, id].slice(0, LIMITS.photosMax) }));
    setCameraOpen(false);
    setErrors({});
  };

  const submit = () => {
    if (!draft.pick || !draft.category || !draft.subcategory) return;
    setSubmitting(true);
    // Small delay so the "sending" state is visible, as it would be over a network.
    setTimeout(async () => {
      const res = await act.createReport({
        category: draft.category!,
        subcategory: draft.subcategory!,
        description: draft.description,
        lng: draft.pick!.lng,
        lat: draft.pick!.lat,
        accuracyM: draft.pick!.accuracyM,
        addressHint: draft.addressHint,
        district: draft.district ?? guessDistrict(draft.pick!),
        photoIds: draft.photoIds,
        clientRequestId: draft.clientRequestId,
      });
      setSubmitting(false);
      if (!res.ok) {
        toast({
          tone: "danger",
          title: t("Илгээж чадсангүй", "Couldn't send your report"),
          body:
            res.error === "rate_limited"
              ? t("Та нэг цагт хэт олон мэдээлэл илгээлээ. Хэсэг хүлээгээд дахин оролдоно уу.", "You've sent too many reports this hour. Wait a little and try again.")
              : t("Юу ч алдагдаагүй — таны мэдээлэл энд хадгалагдсан. Дахин оролдоно уу.", "Nothing was lost — your report is still here. Try again."),
        });
        return;
      }
      sessionStorage.removeItem(DRAFT_KEY);
      setDone(res.report);
    }, 700);
  };

  const stepLabels = [
    t("Зураг", "Photo"),
    t("Ангилал", "Category"),
    t("Байршил", "Location"),
    t("Тайлбар", "Description"),
    t("Шалгах", "Review"),
  ];
  const district = draft.district ?? (draft.pick ? guessDistrict(draft.pick) : null);
  const onCameraScreen = draft.step === 1 && cameraOpen;

  return (
    <FlowFrame
      title={t("Асуудал мэдээлэх", "Report a problem")}
      onClose={() => router.push("/")}
      footer={
        onCameraScreen ? undefined : (
          <div className="mx-auto flex max-w-[480px] gap-2">
            <Button size="lg" icon={ArrowLeft} onClick={goBack} className="shrink-0">
              {t("Буцах", "Back")}
            </Button>
            {draft.step < TOTAL ? (
              <Button size="lg" variant="primary" fullWidth iconEnd={ArrowRight} loading={continueWhenReady && checkingNearby} onClick={goNext}>
                {t("Үргэлжлүүлэх", "Continue")}
              </Button>
            ) : (
              <Button size="lg" variant="primary" fullWidth icon={Send} loading={submitting} onClick={submit}>
                {submitting ? t("Илгээж байна…", "Sending report…") : t("Мэдээлэл илгээх", "Submit report")}
              </Button>
            )}
          </div>
        )
      }
    >
      <div className="mx-auto max-w-[480px] px-4 py-5">
        <Stepper step={draft.step} total={TOTAL} label={stepLabels[draft.step - 1]} />

        {/* Step 1 — Photo, straight from the camera */}
        {draft.step === 1 && (
          <div className="mt-5 space-y-4">
            <div>
              <h1 ref={headingRef} tabIndex={-1} className="text-title-2 font-[600] outline-none">
                {t("Асуудлын зургийг авна уу", "Take a photo of the problem")}
              </h1>
              <p className="text-small text-ink-muted">
                {t(
                  "Яг одоо, тухайн газар дээр нь зураг авна. Хүний царай, машины дугаар оруулахгүй байхыг хичээнэ үү.",
                  "Photograph it now, where it is. Try to keep faces and number plates out of the picture.",
                )}
              </p>
            </div>
            {cameraOpen ? (
              <>
                <CameraCapture onCapture={onCapture} className="aspect-[3/4] w-full sm:aspect-[4/3]" />
                {draft.photoIds.length > 0 && (
                  <Button fullWidth onClick={() => setCameraOpen(false)}>
                    {t("Болих", "Cancel")}
                  </Button>
                )}
              </>
            ) : (
              <>
                <div className={cn("grid gap-2", draft.photoIds.length > 1 && "grid-cols-2")}>
                  {draft.photoIds.map((pid, i) => (
                    <div key={pid} className={cn("relative overflow-hidden rounded-md border border-line", i === 0 && draft.photoIds.length !== 2 && "col-span-2")}>
                      <Photo id={pid} alt={t(`Авсан зураг ${i + 1}`, `Captured photo ${i + 1}`)} className="aspect-[4/3] w-full" />
                      <button
                        type="button"
                        onClick={() => {
                          const photoIds = draft.photoIds.filter((x) => x !== pid);
                          set({ photoIds });
                          if (!photoIds.length) setCameraOpen(true);
                        }}
                        aria-label={t(`${i + 1}-р зургийг дахин авах`, `Retake photo ${i + 1}`)}
                        className="absolute right-2 top-2 inline-flex h-9 items-center gap-1.5 rounded-full bg-black/60 px-3 text-caption font-[600] text-white hover:bg-black/75"
                      >
                        <RotateCcw aria-hidden className="size-4" /> {t("Дахин авах", "Retake")}
                      </button>
                    </div>
                  ))}
                </div>
                {draft.photoIds.length < LIMITS.photosMax && (
                  <Button fullWidth icon={Camera} onClick={() => setCameraOpen(true)}>
                    {t(`Өөр өнцгөөс авах (${draft.photoIds.length}/${LIMITS.photosMax})`, `Take another angle (${draft.photoIds.length}/${LIMITS.photosMax})`)}
                  </Button>
                )}
              </>
            )}
            {errors.photo && (
              <p role="alert" className="text-small font-[550] text-danger">
                {errors.photo}
              </p>
            )}
            <p className="text-caption text-ink-subtle">
              {t(
                "Зөвхөн камераар шинээр авсан зураг хүлээн авна. Зургийн байршлын мэдээллийг автоматаар устгана.",
                "Only new photos from the camera are accepted. Location data is removed from the photo automatically.",
              )}
            </p>
          </div>
        )}

        {/* Step 2 — Main category, then its subcategories */}
        {draft.step === 2 && (
          <div className="mt-5 space-y-6">
            <fieldset>
              <legend>
                <h1 ref={headingRef} tabIndex={-1} className="text-title-2 font-[600] outline-none">
                  {t("Ямар төрлийн асуудал вэ?", "What kind of problem is it?")}
                </h1>
              </legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {catalog.list.map((c) => {
                  const Icon = ICONS[c.icon];
                  const checked = draft.category === c.id;
                  return (
                    <label
                      key={c.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors duration-[140ms] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus)]",
                        checked ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-line-strong",
                      )}
                    >
                      <input
                        type="radio"
                        name="category"
                        value={c.id}
                        checked={checked}
                        onChange={() => {
                          set({ category: c.id, subcategory: null });
                          setErrors({});
                          requestAnimationFrame(() => subRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
                        }}
                        className="sr-only"
                      />
                      <span className={cn("grid size-10 shrink-0 place-items-center rounded-sm", checked ? "bg-brand text-on-brand" : "bg-surface-sunken text-ink-muted")}>
                        <Icon aria-hidden className="size-5" strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0 flex-1 text-label font-[600]">{pickBi(c.name)}</span>
                    </label>
                  );
                })}
              </div>
              {errors.category && (
                <p role="alert" className="mt-2 text-small font-[550] text-danger">
                  {errors.category}
                </p>
              )}
            </fieldset>

            {category && (
              <fieldset ref={subRef} className="fx-reveal scroll-mt-20">
                <legend className="text-title-3 font-[600]">
                  {t(`${category.name.mn}: яг юу болсон бэ?`, `${category.name.en}: what exactly is wrong?`)}
                </legend>
                <div className="mt-2 grid gap-1.5" role="radiogroup" aria-invalid={!!errors.subcategory || undefined}>
                  {category.subcategories.map((sc) => {
                    const checked = draft.subcategory === sc.id;
                    return (
                      <label
                        key={sc.id}
                        className={cn(
                          "flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus)]",
                          checked ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-line-strong",
                        )}
                      >
                        <input
                          type="radio"
                          name="subcategory"
                          value={sc.id}
                          checked={checked}
                          onChange={() => {
                            set({ subcategory: sc.id });
                            setErrors({});
                          }}
                          className="sr-only"
                        />
                        <span aria-hidden className={cn("grid size-5 shrink-0 place-items-center rounded-full border-2", checked ? "border-brand" : "border-line-strong")}>
                          {checked && <span className="size-2.5 rounded-full bg-brand" />}
                        </span>
                        <span className="text-body">{pickBi(sc.name)}</span>
                      </label>
                    );
                  })}
                </div>
                {errors.subcategory && (
                  <p role="alert" className="mt-2 text-small font-[550] text-danger">
                    {errors.subcategory}
                  </p>
                )}
              </fieldset>
            )}
          </div>
        )}

        {/* Step 3 — Confirm location, then the duplicate check */}
        {draft.step === 3 && !showDuplicates && (
          <div className="mt-5 space-y-4">
            <div>
              <h1 ref={headingRef} tabIndex={-1} className="text-title-2 font-[600] outline-none">
                {t("Байршлаа баталгаажуулна уу", "Confirm the location")}
              </h1>
              <p className="text-small text-ink-muted">
                {t("Газрын зургийг хөдөлгөж, тэмдэгийг яг тэр цэг дээр байрлуулна уу. Газрын зураг дээр товшиж ч болно.", "Move the map so the pin sits on the exact spot. You can also tap the map.")}
              </p>
            </div>
            <div className="relative">
              <TextField
                label={t("Гудамж, газар хайх", "Search a street or place")}
                icon={Search}
                value={placeQuery}
                onChange={setPlaceQuery}
                onClear={() => setPlaceQuery("")}
                placeholder={t("Жишээ: Энхтайваны өргөн чөлөө", "e.g. Peace Avenue")}
              />
              {places.length > 0 && (
                <ul className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-line bg-surface-overlay shadow-md">
                  {places.map((p) => (
                    <li key={p.en}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-body hover:bg-surface-sunken"
                        onClick={() => {
                          set({ pick: { lng: p.lng, lat: p.lat }, district: null, addressHint: draft.addressHint || p[lang] });
                          setPlaceQuery("");
                        }}
                      >
                        <MapPin aria-hidden className="size-4 text-ink-subtle" /> {p[lang]}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <ReportMap
              mode="pick"
              className={cn("h-[46dvh] min-h-[300px] rounded-md border", errors.pick ? "border-2 border-danger" : "border-line")}
              ariaLabel={t("Байршил сонгох газрын зураг", "Map for choosing the location")}
              pick={draft.pick}
              onPick={(p) => set({ pick: p, district: null })}
              onLocateError={(m) => toast({ tone: "info", title: m })}
            />
            {errors.pick && (
              <p role="alert" className="text-small font-[550] text-danger">
                {errors.pick}
              </p>
            )}
            {draft.pick && (
              <p className="text-caption text-ink-subtle tnum">
                {draft.pick.lat.toFixed(5)}, {draft.pick.lng.toFixed(5)}
                {draft.pick.accuracyM ? ` · ± ${draft.pick.accuracyM} m` : ""}
                {district ? ` · ${pickBi(DISTRICT_META[district].label)}` : ""}
              </p>
            )}
            <TextField
              label={t("Ойролцоох тэмдэг, хаяг", "Nearby landmark or address")}
              optional
              hint={t("Хүмүүс олоход тусална. Жишээ: 3-р сургуулийн урд.", "Helps people find it. e.g. In front of School No. 3.")}
              value={draft.addressHint}
              onChange={(v) => set({ addressHint: v })}
              maxLength={200}
            />
            <Select
              label={t("Дүүрэг", "District")}
              hint={t("Байршлаас автоматаар тааварласан. Шаардлагатай бол засна уу.", "Guessed from the location. Change it if needed.")}
              value={district ?? ""}
              onChange={(v) => set({ district: v as DistrictId })}
              options={[
                ...(district ? [] : [{ value: "", label: t("Байршил сонгоно уу", "Choose a location first") }]),
                ...DISTRICT_ORDER.map((d) => ({ value: d, label: pickBi(DISTRICT_META[d].label) })),
              ]}
            />
          </div>
        )}
        {draft.step === 3 && showDuplicates && (
          <div className="mt-5">
            <h1 ref={headingRef} tabIndex={-1} className="mb-3 text-title-2 font-[600] outline-none">
              {t("Эдгээрийн аль нэг нь мөн үү?", "Is it one of these?")}
            </h1>
            <DuplicateHint
              candidates={duplicates}
              now={now}
              confirmedId={confirmedDup}
              onConfirm={confirmDuplicate}
              onContinue={() => {
                setShowDuplicates(false);
                set({ step: 4 });
              }}
            />
          </div>
        )}

        {/* Step 4 — Description */}
        {draft.step === 4 && (
          <div className="mt-5 space-y-5">
            <h1 ref={headingRef} tabIndex={-1} className="text-title-2 font-[600] outline-none">
              {t("Тайлбар нэмэх", "Add a description")}
            </h1>
            <TextField
              multiline
              rows={6}
              required
              label={t("Юу болсон бэ?", "What's wrong?")}
              hint={t("Хэмжээ, хэр удаж байгаа, аюултай эсэх.", "Size, how long it has been there, any danger.")}
              value={draft.description}
              onChange={(v) => set({ description: v })}
              onBlur={() => draft.description && validate(4)}
              maxLength={LIMITS.descriptionMax}
              error={errors.description}
            />
          </div>
        )}

        {/* Step 5 — Review */}
        {draft.step === 5 && draft.pick && draft.category && draft.subcategory && (
          <div className="mt-5 space-y-4">
            <h1 ref={headingRef} tabIndex={-1} className="text-title-2 font-[600] outline-none">
              {t("Шалгаад илгээх", "Check and submit")}
            </h1>
            <dl className="divide-y divide-line rounded-md border border-line bg-surface">
              <div className="flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <dt className="text-caption text-ink-subtle">{t("Зураг", "Photos")}</dt>
                  <dd className="mt-1 flex gap-2">
                    {draft.photoIds.map((pid, i) => (
                      <Photo key={pid} id={pid} alt={t(`Зураг ${i + 1}`, `Photo ${i + 1}`)} className="size-16 rounded-sm" />
                    ))}
                  </dd>
                </div>
                <IconButton icon={Pencil} size="sm" label={t("Зураг засах", "Edit photos")} onClick={() => set({ step: 1 })} />
              </div>
              {[
                {
                  step: 2 as Step,
                  label: t("Ангилал", "Category"),
                  value: `${catalog.label(draft.category, lang)} → ${catalog.subLabel(draft.category, draft.subcategory, lang)}`,
                },
                {
                  step: 3 as Step,
                  label: t("Байршил", "Location"),
                  value: `${draft.addressHint || t("Тэмдэглэсэн цэг", "Pinned point")} · ${pickBi(DISTRICT_META[district ?? "sukhbaatar"].label)}`,
                },
                { step: 4 as Step, label: t("Тайлбар", "Description"), value: draft.description },
              ].map((row) => (
                <div key={row.label} className="flex items-start gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <dt className="text-caption text-ink-subtle">{row.label}</dt>
                    <dd className="whitespace-pre-line break-words text-body">{row.value}</dd>
                  </div>
                  <IconButton icon={Pencil} size="sm" label={t(`${row.label} засах`, `Edit ${row.label.toLowerCase()}`)} onClick={() => set({ step: row.step })} />
                </div>
              ))}
            </dl>
            <div className="flex items-start gap-2.5 rounded-md bg-surface-sunken px-3 py-2.5 text-small text-ink-muted">
              <Hourglass aria-hidden className="mt-0.5 size-4 shrink-0" />
              <p>
                {t(
                  "Ач холбогдлыг (бага, дунд, өндөр, яаралтай) та сонгохгүй — FixUB баг хянаад тогтооно.",
                  "You don't choose the priority (low, medium, high, critical) — the FixUB team sets it after review.",
                )}
              </p>
            </div>
            <Banner tone="info" title={t("Нийтэд нээлттэй болно", "This will be public")}>
              {t(
                "Байршил, ангилал, тайлбар, зураг газрын зураг дээр харагдана. Таны нэр харагдахгүй.",
                "The location, category, description and photos appear on the public map. Your name is not shown.",
              )}
            </Banner>
          </div>
        )}
      </div>
    </FlowFrame>
  );
}

function FlowFrame({
  title,
  onClose,
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useT();
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="sticky top-0 z-20 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-[480px] items-center gap-2 px-2">
          <IconButton icon={X} label={t("Хаах", "Close")} onClick={onClose} />
          <p className="flex-1 truncate text-label font-[600]">{title}</p>
          <SampleDataPill className="mr-2" />
        </div>
      </header>
      <div className="flex-1">{children}</div>
      {footer && (
        <div className="sticky bottom-0 z-20 border-t border-line bg-surface px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
          {footer}
        </div>
      )}
      <Link href="/" className="sr-only">
        {t("Нүүр хуудас", "Home")}
      </Link>
    </div>
  );
}
