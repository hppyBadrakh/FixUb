"use client";

import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import type { LucideIcon } from "lucide-react";
import { STATUS_META, STATUS_ORDER } from "@/lib/meta";
import type { ReportStatus } from "@/lib/types";

const v = (s: ReportStatus) => STATUS_META[s].cssKey;

/**
 * One report on the map: a single circle. Fill colour = status (see the legend), centre glyph =
 * category. Selecting it opens the report's info panel; there is no separate detail icon.
 */
export function MapMarkerView({
  status,
  icon: Glyph,
  selected,
  label,
  onClick,
  as = "button",
  size = 32,
}: {
  status: ReportStatus;
  icon: LucideIcon;
  selected?: boolean;
  label?: string;
  onClick?: () => void;
  as?: "button" | "span";
  size?: number;
}) {
  const Tag = as;
  return (
    <Tag
      {...(as === "button" ? { type: "button" as const, onClick, "aria-label": label, "aria-pressed": selected } : { "aria-hidden": true })}
      className={cn(
        "fx-map-marker relative grid place-items-center rounded-full transition-transform duration-[140ms] hover:scale-[1.08] [@media(pointer:coarse)]:before:absolute [@media(pointer:coarse)]:before:-inset-1.5 [@media(pointer:coarse)]:before:content-['']",
        selected && "scale-125 hover:scale-125",
        selected && "ring-[3px] ring-ink ring-offset-1 ring-offset-surface",
      )}
      style={{
        width: size,
        height: size,
        background: `var(--status-${v(status)})`,
        border: "2px solid var(--surface)",
        boxShadow: "var(--shadow-marker)",
        color: `var(--on-status-${v(status)})`,
      }}
    >
      <Glyph aria-hidden style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={2.25} />
    </Tag>
  );
}

export function MapClusterView({
  count,
  breakdown,
  onClick,
}: {
  count: number;
  breakdown: Partial<Record<ReportStatus, number>>;
  onClick: () => void;
}) {
  const { t, pick } = useT();
  const present = STATUS_ORDER.filter((s) => breakdown[s]);
  const ends = present.map((_, i) => present.slice(0, i + 1).reduce((sum, s) => sum + breakdown[s]!, 0));
  const stops = present.map(
    (s, i) => `var(--status-${v(s)}) ${((i ? ends[i - 1] : 0) / count) * 360}deg ${(ends[i] / count) * 360}deg`,
  );
  const size = count >= 100 ? 56 : count >= 10 ? 46 : 38;
  const parts = STATUS_ORDER.filter((s) => breakdown[s]).map((s) => `${breakdown[s]} ${pick(STATUS_META[s].label).toLowerCase()}`);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t(`Энд ${count} мэдээлэл: ${parts.join(", ")}. Томруулах.`, `${count} reports here: ${parts.join(", ")}. Zoom in.`)}
      className="fx-map-marker grid place-items-center rounded-full p-[4px] transition-transform duration-[140ms] hover:scale-[1.06]"
      style={{ width: size, height: size, background: `conic-gradient(${stops.join(",")})`, boxShadow: "var(--shadow-marker)" }}
    >
      <span className="grid size-full place-items-center rounded-full bg-surface text-small font-[700] text-ink tnum">{count}</span>
    </button>
  );
}

export function MapLegend({ statuses, className }: { statuses: ReportStatus[]; className?: string }) {
  const { t, pick } = useT();
  return (
    <div className={cn("rounded-md border border-line bg-surface-overlay p-3 shadow-md", className)}>
      <p className="text-eyebrow font-[650] uppercase tracking-wide text-ink-muted">{t("Төлөв", "Status")}</p>
      <ul className="mt-2 space-y-1.5">
        {statuses.map((s) => (
          <li key={s} className="flex items-center gap-2 text-caption">
            <span
              aria-hidden
              className="size-4 shrink-0 rounded-full"
              style={{ background: `var(--status-${v(s)})`, border: "2px solid var(--surface)", boxShadow: "var(--shadow-marker)" }}
            />
            {pick(STATUS_META[s].label)}
          </li>
        ))}
      </ul>
      <p className="mt-2 max-w-[13rem] text-[12px] leading-4 text-ink-subtle">
        {t(
          "Өнгө = төлөв · дүрс = ангилал. Тэмдэг дээр дарж дэлгэрэнгүйг харна.",
          "Colour = status · symbol = category. Select a marker to see its details.",
        )}
      </p>
    </div>
  );
}
