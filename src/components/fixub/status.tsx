"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronsUp, Equal, Hourglass, OctagonAlert } from "lucide-react";
import { CLOSURE_LABEL, ICONS, PRIORITY_META, STATUS_META } from "@/lib/meta";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import type { CategorySlug, ClosureReason, Priority, ReportStatus } from "@/lib/types";

const badgeTone: Record<ReportStatus, string> = {
  reported: "bg-[var(--status-reported-soft)] text-[var(--status-reported-text)]",
  investigating: "bg-[var(--status-investigating-soft)] text-[var(--status-investigating-text)]",
  in_progress: "bg-[var(--status-in-progress-soft)] text-[var(--status-in-progress-text)]",
  resolved: "bg-[var(--status-resolved-soft)] text-[var(--status-resolved-text)]",
  closed: "bg-[var(--status-closed-soft)] text-[var(--status-closed-text)]",
};

/** Official status: always icon + word; colour is the third cue. */
export function StatusBadge({
  status,
  reason,
  size = "md",
  className,
}: {
  status: ReportStatus;
  reason?: ClosureReason;
  size?: "md" | "lg";
  className?: string;
}) {
  const { pick } = useT();
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  // Short scale-in when the status changes in place.
  const prev = useRef(status);
  const [changed, setChanged] = useState(0);
  useEffect(() => {
    if (prev.current !== status) {
      prev.current = status;
      setChanged((c) => c + 1);
    }
  }, [status]);
  return (
    <span
      key={changed}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-xs font-[600]",
        size === "lg" ? "px-2.5 py-1 text-small" : "px-1.5 py-0.5 text-caption",
        badgeTone[status],
        changed > 0 && "fx-badge",
        className,
      )}
    >
      <Icon aria-hidden className={size === "lg" ? "size-4" : "size-3.5"} strokeWidth={2} />
      {pick(meta.label)}
      {status === "closed" && reason && <span className="font-[500] opacity-80">· {pick(CLOSURE_LABEL[reason])}</span>}
    </span>
  );
}

export function StatusDot({ status, className }: { status: ReportStatus; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ background: `var(--status-${STATUS_META[status].cssKey})` }}
    />
  );
}

export function CategoryTag({
  category,
  subcategory,
  boxed,
  className,
}: {
  category: CategorySlug;
  /** When given, shows "Category · Subcategory". */
  subcategory?: string;
  boxed?: boolean;
  className?: string;
}) {
  const { lang } = useT();
  const { catalog } = useStore();
  const Icon = ICONS[catalog.get(category)?.icon ?? "ellipsis"];
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1 text-caption font-[500] text-ink-muted",
        boxed && "rounded-xs bg-surface-sunken px-1.5 py-0.5",
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={2} />
      <span className="min-w-0">
        {catalog.label(category, lang)}
        {subcategory && <span className="font-[400]"> · {catalog.subLabel(category, subcategory, lang)}</span>}
      </span>
    </span>
  );
}

const priorityTone: Record<Priority, string> = {
  critical: "bg-danger-fill text-on-danger",
  high: "bg-danger-soft text-danger",
  medium: "bg-[var(--status-closed-soft)] text-ink",
  low: "bg-[var(--status-closed-soft)] text-ink-muted",
};

/**
 * Official priority, set by an admin. `null` renders "Pending review" so it's never mistaken
 * for an approved priority.
 */
export function PriorityBadge({ priority, className }: { priority: Priority | null; className?: string }) {
  const { pick, t } = useT();
  if (!priority)
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap rounded-xs border border-dashed border-line-strong px-1.5 py-[1px] text-caption font-[550] text-ink-muted",
          className,
        )}
        title={t("Админ хянаж, ач холбогдлыг тогтооно", "An admin will review it and set the priority")}
      >
        <Hourglass aria-hidden className="size-3.5" strokeWidth={2} />
        {t("Хянагдаж байна", "Pending review")}
      </span>
    );
  const Icon = priority === "critical" ? OctagonAlert : priority === "high" ? ChevronsUp : priority === "medium" ? Equal : ChevronDown;
  return (
    <span
      className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-xs px-1.5 py-0.5 text-caption font-[650]", priorityTone[priority], className)}
    >
      <Icon aria-hidden className="size-3.5" strokeWidth={2.25} />
      <span className="sr-only">{t("Ач холбогдол:", "Priority:")} </span>
      {pick(PRIORITY_META[priority].label)}
    </span>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("text-[22px] font-[750] leading-none tracking-tight text-ink", className)}>
      Fix<span className="text-brand">UB</span>
    </span>
  );
}
