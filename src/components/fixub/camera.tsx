"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, RefreshCw, SwitchCamera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { processImage } from "@/lib/data/photoStore";
import { useT } from "@/lib/i18n";

type Phase = "starting" | "live" | "denied" | "no_camera" | "unsupported" | "error";

/**
 * Live camera capture. Photos can only come from the camera: there is deliberately no gallery,
 * file picker or drag-and-drop. This is a deterrent against misleading reports, not proof that a
 * photo shows the real problem.
 */
export function CameraCapture({
  onCapture,
  className,
  autoStart = true,
}: {
  onCapture: (photo: Blob) => void;
  className?: string;
  autoStart?: boolean;
}) {
  const { t } = useT();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [multiple, setMultiple] = useState(false);
  const [shooting, setShooting] = useState(false);
  const [flash, setFlash] = useState(false);
  // If the browser is still asking for permission after a moment, say what to do.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (phase !== "starting") return;
    const id = setTimeout(() => setSlow(true), 2500);
    return () => {
      clearTimeout(id);
      setSlow(false);
    };
  }, [phase]);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
  }, []);

  const start = useCallback(
    async (mode: "environment" | "user") => {
      stop();
      setPhase("starting");
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        // Typical causes: an old browser, or the page served over plain http (not localhost).
        setPhase("unsupported");
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          // Prefer the rear camera on phones.
          video: { facingMode: { ideal: mode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => {});
        }
        setPhase("live");
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        setMultiple(devices.filter((d) => d.kind === "videoinput").length > 1);
      } catch (e) {
        const name = (e as DOMException)?.name;
        setPhase(
          name === "NotAllowedError" || name === "SecurityError"
            ? "denied"
            : name === "NotFoundError" || name === "OverconstrainedError" || name === "NotReadableError"
              ? "no_camera"
              : "error",
        );
      }
    },
    [stop],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opening the camera is a side effect of mounting
    if (autoStart) void start("environment");
    return stop;
  }, [autoStart, start, stop]);

  const shoot = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    setShooting(true);
    setFlash(true);
    setTimeout(() => setFlash(false), 160);
    const max = 1600;
    const scale = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
    // Re-encoding a canvas frame carries no EXIF or GPS metadata.
    canvas.toBlob(
      (blob) => {
        setShooting(false);
        if (blob) {
          stop();
          onCapture(blob);
        }
      },
      "image/jpeg",
      0.85,
    );
  };

  const problem =
    phase === "denied"
      ? {
          title: t("Камерын зөвшөөрөл олгоогүй байна", "Camera access is blocked"),
          body: t(
            "Хаягийн мөрний хажууд байгаа цоож (эсвэл камер) дүрс дээр дарж, “Камер” → “Зөвшөөрөх” болгоод “Дахин оролдох” дарна уу. Утсан дээр: Тохиргоо → хөтөч → Камер.",
            "Select the lock (or camera) icon next to the address bar, set Camera to “Allow”, then press Try again. On a phone: Settings → your browser → Camera.",
          ),
        }
      : phase === "no_camera"
        ? {
            title: t("Камер олдсонгүй", "No camera found"),
            body: t(
              "Энэ төхөөрөмжид камер алга эсвэл өөр програм ашиглаж байна. Камертай утсаар нээх эсвэл бусад програмаа хаагаад дахин оролдоно уу.",
              "This device has no camera, or another app is using it. Open FixUB on a phone with a camera, or close the other app and try again.",
            ),
          }
        : phase === "unsupported"
          ? {
              title: t("Энэ хөтөч камер нээж чадахгүй байна", "This browser can't open the camera"),
              body: t(
                "Камер ашиглахын тулд хуудсыг HTTPS-ээр нээж, Chrome, Safari эсвэл Firefox-ын сүүлийн хувилбарыг ашиглана уу.",
                "The camera needs the page to be opened over HTTPS in a current version of Chrome, Safari or Firefox.",
              ),
            }
          : phase === "error"
            ? {
                title: t("Камер нээгдсэнгүй", "The camera didn't start"),
                body: t("Дахин оролдоно уу.", "Please try again."),
              }
            : null;

  return (
    <div className={cn("relative overflow-hidden rounded-md bg-[#0b0f15] text-white", className)}>
      <video
        ref={video}
        playsInline
        muted
        aria-label={t("Камерын урьдчилсан харагдац", "Camera preview")}
        className={cn("size-full object-cover", phase !== "live" && "invisible", facing === "user" && "-scale-x-100")}
      />
      {flash && <div aria-hidden className="absolute inset-0 bg-white/70" />}

      {phase === "starting" && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-small text-white/80" role="status">
          <div>
            <p>{t("Камер нээж байна…", "Opening the camera…")}</p>
            {slow && (
              <p className="mt-2 max-w-[32ch] text-white">
                {t("Хөтөч камер ашиглах зөвшөөрөл асуувал “Зөвшөөрөх” дарна уу.", "If your browser asks to use the camera, choose “Allow”.")}
              </p>
            )}
          </div>
        </div>
      )}

      {problem && (
        <div role="alert" className="absolute inset-0 grid place-items-center overflow-y-auto bg-surface-sunken p-5 text-center text-ink">
          <div className="max-w-[40ch]">
            <CameraOff aria-hidden className="mx-auto size-7 text-ink-muted" strokeWidth={1.5} />
            <p className="mt-2 text-label font-[650]">{problem.title}</p>
            <p className="mt-1 text-small text-ink-muted">{problem.body}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button icon={RefreshCw} onClick={() => start(facing)}>
                {t("Дахин оролдох", "Try again")}
              </Button>
              {phase === "unsupported" && (
                // Touch devices only: `capture` opens the phone's camera app directly (no gallery).
                <label className="hidden h-11 cursor-pointer items-center gap-2 rounded-sm bg-brand px-4 text-label font-[550] text-on-brand focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus)] [@media(pointer:coarse)]:inline-flex">
                  <Camera aria-hidden className="size-5" strokeWidth={1.75} />
                  {t("Утасны камер нээх", "Open phone camera")}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      try {
                        onCapture(await processImage(file));
                      } catch {
                        setPhase("error");
                      }
                    }}
                  />
                </label>
              )}
            </div>
          </div>
        </div>
      )}

      {phase === "live" && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-6 bg-gradient-to-t from-black/60 to-transparent pb-4 pt-10">
          <span className="size-11" aria-hidden />
          <button
            type="button"
            onClick={shoot}
            disabled={shooting}
            aria-label={t("Зураг авах", "Take photo")}
            className="grid size-[68px] place-items-center rounded-full border-4 border-white bg-white/25 transition-transform duration-[90ms] active:scale-95"
          >
            <span className="grid size-[52px] place-items-center rounded-full bg-white text-[#0b0f15]">
              <Camera aria-hidden className="size-6" strokeWidth={1.75} />
            </span>
          </button>
          {multiple ? (
            <button
              type="button"
              onClick={() => {
                const next = facing === "environment" ? "user" : "environment";
                setFacing(next);
                void start(next);
              }}
              aria-label={t("Камер солих", "Switch camera")}
              className="grid size-11 place-items-center rounded-full bg-black/40 text-white"
            >
              <SwitchCamera aria-hidden className="size-5" strokeWidth={1.75} />
            </button>
          ) : (
            <span className="size-11" aria-hidden />
          )}
        </div>
      )}
    </div>
  );
}
