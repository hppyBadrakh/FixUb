"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/** 0 = peek (handle and header only), 1 = half the container, 2 = almost all of it. */
export type SheetSnap = 0 | 1 | 2;

/**
 * A sheet docked to the bottom of its positioned parent, over whatever the parent holds (the map).
 * Drag the handle, tap it, or use Enter / Space / arrow keys to move between three heights. The
 * content is only reachable (focus, scroll) once the sheet is open.
 */
export function BottomSheet({
  snap,
  onSnapChange,
  peek = 72,
  label,
  expandLabel,
  header,
  children,
  resetScrollKey,
  className,
}: {
  snap: SheetSnap;
  onSnapChange: (s: SheetSnap) => void;
  /** Height in px when collapsed. */
  peek?: number;
  /** Accessible name of the sheet. */
  label: string;
  /** Accessible name of the handle button. */
  expandLabel: string;
  /** Shown next to the grab bar, always visible. */
  header: React.ReactNode;
  children: React.ReactNode;
  /** When this changes (a new filter, a new search) the content scrolls back to the top. */
  resetScrollKey?: string;
  className?: string;
}) {
  const sheet = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [resetScrollKey]);
  const [room, setRoom] = useState(0);
  const [live, setLive] = useState<number | null>(null);
  const gesture = useRef<{ y: number; h: number; t: number; moved: boolean } | null>(null);

  useLayoutEffect(() => {
    const parent = sheet.current?.parentElement;
    if (!parent) return;
    const measure = () => setRoom(parent.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  const full = Math.max(peek, room - 8);
  // Half is a share of the room, but never so short that a list row or a message gets cut off.
  const stops = [peek, Math.min(full, Math.max(Math.round(room * 0.52), 300)), full];
  const height = live ?? stops[snap];
  const clamp = (h: number) => Math.min(stops[2], Math.max(peek, h));
  const nearest = (h: number): SheetSnap =>
    ([0, 1, 2] as const).reduce((best, i) => (Math.abs(stops[i] - h) < Math.abs(stops[best] - h) ? i : best), 0 as SheetSnap);

  const onDown = (e: React.PointerEvent) => {
    gesture.current = { y: e.clientY, h: stops[snap], t: performance.now(), moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dy = g.y - e.clientY;
    if (Math.abs(dy) > 5) g.moved = true;
    if (g.moved) setLive(clamp(g.h + dy));
  };
  const onUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (!g.moved) {
      onSnapChange(snap === 2 ? 0 : ((snap + 1) as SheetSnap)); // a tap steps up, then back down
    } else {
      const dy = g.y - e.clientY;
      const velocity = dy / Math.max(1, performance.now() - g.t); // px per ms, up is positive
      onSnapChange(nearest(clamp(g.h + dy + velocity * 160)));
    }
    setLive(null);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") onSnapChange(Math.min(2, snap + 1) as SheetSnap);
    else if (e.key === "ArrowDown") onSnapChange(Math.max(0, snap - 1) as SheetSnap);
    else if (e.key === "Enter" || e.key === " ") onSnapChange(snap === 2 ? 0 : ((snap + 1) as SheetSnap));
    else return;
    e.preventDefault();
  };

  return (
    <section
      ref={sheet}
      aria-label={label}
      className={cn("absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-lg border-t border-line bg-surface-overlay shadow-lg", className)}
      style={{ height, transition: live === null ? "height 220ms var(--ease-standard)" : "none" }}
    >
      <button
        type="button"
        aria-expanded={snap > 0}
        aria-label={expandLabel}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => {
          gesture.current = null;
          setLive(null);
        }}
        onKeyDown={onKey}
        style={{ height: peek, touchAction: "none" }}
        className="flex w-full shrink-0 flex-col items-center justify-start gap-2 px-4 pt-2.5 text-left"
      >
        <span aria-hidden className="h-1 w-10 rounded-full bg-line-strong" />
        <span className="w-full text-small text-ink-subtle">{header}</span>
      </button>
      <div ref={body} inert={snap === 0} className={cn("min-h-0 flex-1 border-t border-line", snap === 0 ? "overflow-hidden" : "overflow-y-auto overscroll-contain")}>
        {children}
      </div>
    </section>
  );
}
