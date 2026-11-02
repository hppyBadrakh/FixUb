"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { IconButton } from "./button";

/** Moves focus into the overlay on open, closes on Escape, returns focus to the trigger on close. */
function useOverlayFocus(open: boolean, onClose: () => void, initial?: React.RefObject<HTMLElement | null>) {
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    const target = initial?.current ?? box.current?.querySelector<HTMLElement>("[data-autofocus]") ?? box.current;
    target?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab" && box.current) {
        const items = box.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        );
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      trigger?.focus?.();
    };
  }, [open, initial]);
  return box;
}

export function Dialog({
  open,
  title,
  onClose,
  actions,
  children,
  initialFocus,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  initialFocus?: React.RefObject<HTMLElement | null>;
}) {
  const id = useId();
  const box = useOverlayFocus(open, onClose, initialFocus);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-[var(--scrim)] fx-reveal" onClick={onClose} aria-hidden />
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        className="relative w-full max-w-md rounded-lg bg-surface-overlay p-6 shadow-lg fx-dialog"
      >
        <h2 id={id} className="text-title-3 font-[600]">
          {title}
        </h2>
        {children && <div className="mt-2 text-body text-ink-muted">{children}</div>}
        {actions && <div className="mt-6 flex flex-wrap justify-end gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** Bottom sheet on mobile, centred panel on desktop. Used for filters and small forms. */
export function Sheet({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const id = useId();
  const box = useOverlayFocus(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center md:items-center md:p-6">
      <div className="absolute inset-0 bg-[var(--scrim)] fx-reveal" onClick={onClose} aria-hidden />
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[88dvh] w-full flex-col rounded-t-lg bg-surface-overlay shadow-lg fx-rise md:max-w-lg md:rounded-lg",
        )}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line md:hidden" aria-hidden />
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 id={id} className="text-title-3 font-[600]">
            {title}
          </h2>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-line px-5 py-3 pb-[calc(12px+env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  flush,
  className,
  id,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  flush?: boolean;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("min-w-0 rounded-md border border-line bg-surface shadow-xs", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5 md:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-title-3 font-[600]">{title}</h2>}
            {subtitle && <p className="text-small text-ink-subtle">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={flush ? undefined : "p-4 md:p-5"}>{children}</div>
    </section>
  );
}
