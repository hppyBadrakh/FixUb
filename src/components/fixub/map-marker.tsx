"use client";

import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import { Check, type LucideIcon } from "lucide-react";
import { STATUS_META, STATUS_ORDER } from "@/lib/meta";
import type { Bi, ReportStatus } from "@/lib/types";

/**
 * The map speaks in two tones, so it reads at a glance on a phone: open (brand blue) and fixed
 * (green). Closed reports are grey. The five exact statuses stay in the list, the info panel and
 * the cluster's screen-reader label.
 */
type Tone = "open" | "fixed" | "closed";
const toneOf = (s: ReportStatus): Tone => (s === "resolved" ? "fixed" : s === "closed" ? "closed" : "open");
const TONE_ORDER: Tone[] = ["open", "fixed", "closed"];
const TONE: Record<Tone, { fill: string; on: string; label: Bi }> = {
  open: { fill: "var(--brand)", on: "var(--on-brand)", label: { mn: "Нээлттэй", en: "Open" } },
  fixed: { fill: "var(--status-resolved)", on: "var(--on-status-resolved)", label: { mn: "Засагдсан", en: "Fixed" } },
  closed: { fill: "var(--status-closed)", on: "var(--on-status-closed)", label: { mn: "Хаагдсан", en: "Closed" } },
};

/**
 * One report on the map: a single circle. Fill colour = open or fixed (see the legend; fixed also
 * carries a check, so colour is never the only cue), centre glyph = category. Selecting it opens the report's info panel; there is no separate detail icon.
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
  const tone = TONE[toneOf(status)];
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
        background: tone.fill,
        border: "2px solid var(--surface)",
        boxShadow: "var(--shadow-marker)",
        color: tone.on,
      }}
    >
      <Glyph aria-hidden style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={2.25} />
      {status === "resolved" && (
        <span
          aria-hidden
          className="absolute -right-1 -top-1 grid place-items-center rounded-full bg-surface"
          style={{ width: size * 0.5, height: size * 0.5, color: "var(--status-resolved-text)" }}
        >
          <Check style={{ width: size * 0.34, height: size * 0.34 }} strokeWidth={3.25} />
        </span>
      )}
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
  const groups = TONE_ORDER.map((tn) => ({
    tn,
    n: STATUS_ORDER.filter((st) => toneOf(st) === tn).reduce((sum, st) => sum + (breakdown[st] ?? 0), 0),
  })).filter((g) => g.n > 0);
  const stops = groups.map((g, i) => {
    const from = groups.slice(0, i).reduce((sum, x) => sum + x.n, 0);
    return `${TONE[g.tn].fill} ${(from / count) * 360}deg ${((from + g.n) / count) * 360}deg`;
  });
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
  const tones = TONE_ORDER.filter((tn) => statuses.some((st) => toneOf(st) === tn));
  return (
    <div className={cn("rounded-md border border-line bg-surface-overlay p-3 shadow-md", className)}>
      <ul className="space-y-1.5">
        {tones.map((tn) => (
          <li key={tn} className="flex items-center gap-2 text-caption font-[550]">
            <span
              aria-hidden
              className="size-4 shrink-0 rounded-full"
              style={{ background: TONE[tn].fill, border: "2px solid var(--surface)", boxShadow: "var(--shadow-marker)" }}
            />
            {pick(TONE[tn].label)}
          </li>
        ))}
      </ul>
      <p className="mt-2 max-w-[13rem] text-[12px] leading-4 text-ink-subtle">
        {t("Дүрс = ангилал. Тэмдэг дээр дарж дэлгэрэнгүйг харна.", "Symbol = category. Select a marker to see its details.")}
      </p>
    </div>
  );
}
