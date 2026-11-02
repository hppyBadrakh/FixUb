"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CircleCheck, CircleX, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";

type Tone = "info" | "success" | "warning" | "danger";

const toneBox: Record<Tone, string> = {
  info: "bg-brand-soft text-ink",
  success: "bg-success-soft text-ink",
  warning: "bg-warning-soft text-ink",
  danger: "bg-danger-soft text-ink",
};
const toneIcon: Record<Tone, { icon: LucideIcon; cls: string }> = {
  info: { icon: Info, cls: "text-brand" },
  success: { icon: CircleCheck, cls: "text-success" },
  warning: { icon: TriangleAlert, cls: "text-warning" },
  danger: { icon: CircleX, cls: "text-danger" },
};

export function Banner({
  tone = "info",
  title,
  children,
  actions,
  icon,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  const Icon = icon ?? toneIcon[tone].icon;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex flex-wrap items-start gap-3 rounded-md px-4 py-3", toneBox[tone], className)}
    >
      <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", toneIcon[tone].cls)} strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        {title && <p className="text-label font-[600]">{title}</p>}
        {children && <div className="text-small text-ink-muted">{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function SampleDataPill({ className }: { className?: string }) {
  const { t } = useT();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-caption font-[500] text-warning",
        className,
      )}
    >
      <Info aria-hidden className="size-3.5" strokeWidth={2} />
      <b className="font-[650]">{t("Демо өгөгдөл", "Sample data")}</b>
      <span className="hidden sm:inline">· {t("бодит мэдээлэл биш", "not real reports")}</span>
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      <span className="grid size-12 place-items-center rounded-full bg-surface-sunken text-ink-muted">
        <Icon aria-hidden className="size-6" strokeWidth={1.5} />
      </span>
      <p className="mt-4 text-title-3 font-[600]">{title}</p>
      {children && <p className="mt-1 max-w-[46ch] text-body text-ink-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("rounded-xs fx-skeleton", className)} />;
}

export function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 px-4 py-8 md:px-6" aria-busy="true">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-5 w-96 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-80" />
    </div>
  );
}

/* ---------- Toasts ---------- */

interface Toast {
  id: number;
  tone: "success" | "danger" | "info";
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
}

const ToastContext = createContext<((t: Omit<Toast, "id">) => void) | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = ++seq.current;
      setToasts((ts) => [...ts, { ...t, id }].slice(-3));
      if (t.tone !== "danger") setTimeout(() => dismiss(id), t.action ? 8000 : 6000);
    },
    [dismiss],
  );
  const value = useMemo(() => push, [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-end gap-2 md:bottom-6 md:left-auto md:right-6 md:w-96"
      >
        {toasts.map((t) => {
          const { icon: Icon, cls } = toneIcon[t.tone];
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex w-full items-start gap-3 rounded-md border border-line bg-surface-overlay p-4 shadow-md fx-rise"
            >
              <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", cls)} strokeWidth={1.75} />
              <div className="min-w-0 flex-1">
                <p className="text-label font-[600]">{t.title}</p>
                {t.body && <p className="text-small text-ink-muted">{t.body}</p>}
                {t.action && (
                  <button
                    type="button"
                    className="mt-1 text-small font-[600] text-brand underline-offset-2 hover:underline"
                    onClick={() => {
                      t.action!.onClick();
                      dismiss(t.id);
                    }}
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismiss(t.id)}
                className="grid size-8 shrink-0 place-items-center rounded-sm text-ink-muted hover:bg-surface-sunken"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const v = useContext(ToastContext);
  if (!v) throw new Error("useToast must be used inside ToastProvider");
  return v;
}
