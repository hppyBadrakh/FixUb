"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowRight, Layers, LocateFixed, MapPin, WifiOff, X } from "lucide-react";
import type { ExpressionSpecification, GeoJSONSource, Map as MlMap, Marker as MlMarker } from "maplibre-gl";
import { cn } from "@/lib/cn";
import { inServiceArea } from "@/lib/domain/geo";
import { descriptionOf, placeOf } from "@/lib/domain/metrics";
import { formatDateTime, timeAgo } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { DISTRICT_META, STATUS_META, STATUS_ORDER, UB_CENTER } from "@/lib/meta";
import { useNow, useStore } from "@/lib/store";
import type { CategorySlug, Lang, LngLat, Report, ReportStatus } from "@/lib/types";
import { MapClusterView, MapLegend, MapMarkerView } from "./map-marker";
import { CategoryTag, PriorityBadge, StatusBadge } from "./status";

// The map style (a MapLibre style JSON URL). The default is OpenFreeMap's public server: real
// OpenStreetMap streets and no API key, but also no service guarantee. For real traffic set
// NEXT_PUBLIC_MAP_STYLE_URL at build time to a provider you have an agreement with.
const STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/positron";
const MAX_BOUNDS: [[number, number], [number, number]] = [
  [106.45, 47.72],
  [107.4, 48.12],
];

type ItemData =
  | { key: string; kind: "point"; id: string; status: ReportStatus; category: CategorySlug }
  | { key: string; kind: "cluster"; clusterId: number; count: number; breakdown: Partial<Record<ReportStatus, number>>; lngLat: [number, number] };
type Item = ItemData & { el: HTMLElement };

export interface PickValue extends LngLat {
  accuracyM?: number;
}

function toGeoJSON(reports: Report[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: reports.map((r) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [r.lng, r.lat] },
      properties: { id: r.id, status: r.status, category: r.category },
    })),
  };
}

/** Show Mongolian (Cyrillic) or English names on the basemap labels. */
function relabel(map: MlMap, lang: Lang) {
  const field = (
    lang === "mn"
      ? ["coalesce", ["get", "name:mn"], ["get", "name:nonlatin"], ["get", "name"]]
      : ["coalesce", ["get", "name:en"], ["get", "name_en"], ["get", "name:latin"], ["get", "name"]]
  ) as unknown as ExpressionSpecification;
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== "symbol") continue;
    const tf = map.getLayoutProperty(layer.id, "text-field");
    if (tf && JSON.stringify(tf).includes("name")) map.setLayoutProperty(layer.id, "text-field", field);
  }
}

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function ReportMap({
  reports = [],
  selectedId,
  onSelect,
  mode = "browse",
  pick,
  onPick,
  className,
  initialZoom,
  center,
  ariaLabel,
  showLegend = mode === "browse",
  legendStatuses = STATUS_ORDER,
  onLocateError,
  schematicLabel,
  detailHref,
  compact = false,
}: {
  reports?: Report[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  mode?: "browse" | "pick" | "static";
  pick?: PickValue | null;
  onPick?: (p: PickValue) => void;
  className?: string;
  initialZoom?: number;
  center?: LngLat;
  ariaLabel: string;
  showLegend?: boolean;
  legendStatuses?: ReportStatus[];
  onLocateError?: (message: string) => void;
  schematicLabel?: string;
  /** Where the info panel's "Open full report" link goes. Markers always open the panel. */
  detailHref?: (id: string) => string;
  /** Phone-first panel: title, place, status and one Open action. */
  compact?: boolean;
}) {
  const { lang, t, pick: pickBi } = useT();
  const { catalog } = useStore();
  const now = useNow();
  // Selection is controlled when the page passes `selectedId`, otherwise kept here.
  const [ownSelected, setOwnSelected] = useState<string | null>(null);
  const controlled = selectedId !== undefined;
  const currentId = controlled ? selectedId : ownSelected;
  const select = useCallback(
    (id: string | null) => {
      if (!controlled) setOwnSelected(id);
      onSelect?.(id);
    },
    [controlled, onSelect],
  );
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const libRef = useRef<typeof import("maplibre-gl") | null>(null);
  const markers = useRef(new Map<string, MlMarker>());
  const userDot = useRef<MlMarker | null>(null);
  const signature = useRef("");
  const pendingAccuracy = useRef<number | undefined>(undefined);
  const [items, setItems] = useState<Item[]>([]);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [legendOpen, setLegendOpen] = useState(false);
  const [locating, setLocating] = useState(false);

  // Latest props for map event handlers created once.
  const latest = useRef({ reports, onSelect: select, onPick, mode, lang });
  useEffect(() => {
    latest.current = { reports, onSelect: select, onPick, mode, lang };
  });

  const sync = useCallback(() => {
    const map = mapRef.current;
    const ml = libRef.current;
    if (!map || !ml || !map.getSource("reports") || latest.current.mode === "pick") return;
    const seen = new Map<string, ItemData>();
    for (const f of map.querySourceFeatures("reports")) {
      const p = f.properties as Record<string, unknown>;
      let coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
      let key: string;
      if (p.cluster) {
        key = `c${p.cluster_id}`;
        if (seen.has(key)) continue;
        const breakdown: Partial<Record<ReportStatus, number>> = {};
        for (const s of STATUS_ORDER) if (Number(p[s])) breakdown[s] = Number(p[s]);
        seen.set(key, { key, kind: "cluster", clusterId: Number(p.cluster_id), count: Number(p.point_count), breakdown, lngLat: coords });
      } else {
        key = `r${p.id}`;
        if (seen.has(key)) continue;
        seen.set(key, { key, kind: "point", id: String(p.id), status: p.status as ReportStatus, category: p.category as CategorySlug });
        // Use exact coordinates (tile quantisation shifts them slightly).
        const r = latest.current.reports.find((x) => x.id === p.id);
        if (r) coords = [r.lng, r.lat];
      }
      const m = markers.current.get(key);
      if (m) m.setLngLat(coords);
      else {
        const el = document.createElement("div");
        markers.current.set(key, new ml.Marker({ element: el, anchor: "center" }).setLngLat(coords).addTo(map));
      }
    }
    for (const [key, m] of markers.current) {
      if (!seen.has(key)) {
        m.remove();
        markers.current.delete(key);
      }
    }
    const next: Item[] = [...seen.values()].map((it) => ({ ...it, el: markers.current.get(it.key)!.getElement() }) as Item);
    const sig = next
      .map((i) => (i.kind === "cluster" ? `${i.key}:${i.count}` : `${i.key}:${i.status}:${i.category}`))
      .sort()
      .join("|");
    if (sig !== signature.current) {
      signature.current = sig;
      setItems(next);
    }
  }, []);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let map: MlMap | null = null;
    const markerSet = markers.current;
    const start = center ?? pick ?? UB_CENTER;
    const timeout = setTimeout(() => {
      if (!map?.loaded()) setPhase((p) => (p === "loading" ? "error" : p));
    }, 15000);
    (async () => {
      // In the browser this is MapLibre GL; see src/lib/map-library.ts.
      const ml = (await import("@/lib/map-library")) as unknown as typeof import("maplibre-gl");
      if (cancelled || !container.current) return;
      // Served from /public by scripts/copy-maplibre-worker.mjs; the bundler doesn't emit it.
      ml.setWorkerUrl(new URL("/vendor/maplibre-gl-worker.mjs", window.location.href).href);
      libRef.current = ml;
      try {
        map = new ml.Map({
          container: container.current,
          style: STYLE_URL,
          center: [start.lng, start.lat],
          zoom: initialZoom ?? (mode === "pick" ? (pick ? 16 : 12) : 11.3),
          maxBounds: MAX_BOUNDS,
          attributionControl: { compact: true },
          dragRotate: false,
          pitchWithRotate: false,
        });
      } catch {
        setPhase("error");
        return;
      }
      mapRef.current = map;
      map.touchZoomRotate.disableRotation();
      map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => {
        if (!map) return;
        relabel(map, latest.current.lang);
        const statusSum = (s: ReportStatus) => ["+", ["case", ["==", ["get", "status"], s], 1, 0]];
        map.addSource("reports", {
          type: "geojson",
          data: toGeoJSON(latest.current.mode === "pick" ? [] : latest.current.reports),
          cluster: true,
          clusterRadius: 48,
          clusterMaxZoom: 14,
          clusterProperties: Object.fromEntries(STATUS_ORDER.map((s) => [s, statusSum(s)])),
        });
        // Invisible layer so the source is tiled; markers themselves are DOM (React portals).
        map.addLayer({ id: "reports-hit", type: "circle", source: "reports", paint: { "circle-radius": 1, "circle-opacity": 0 } });
        setPhase("ready");
        sync();
      });
      map.on("moveend", () => {
        sync();
        if (latest.current.mode === "pick" && map) {
          const c = map.getCenter();
          latest.current.onPick?.({ lng: c.lng, lat: c.lat, accuracyM: pendingAccuracy.current });
          pendingAccuracy.current = undefined;
        }
      });
      map.on("sourcedata", (e) => {
        if (e.sourceId === "reports" && e.isSourceLoaded) sync();
      });
      map.on("click", (e) => {
        if (latest.current.mode === "pick") map?.easeTo({ center: e.lngLat, duration: reducedMotion() ? 0 : 300 });
        else if ((e.originalEvent.target as HTMLElement).classList.contains("maplibregl-canvas")) latest.current.onSelect?.(null);
      });
    })();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      markerSet.forEach((m) => m.remove());
      markerSet.clear();
      signature.current = "";
      map?.remove();
      mapRef.current = null;
    };
    // The map is created once; later prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Data changes.
  useEffect(() => {
    const src = mapRef.current?.getSource("reports") as GeoJSONSource | undefined;
    if (phase === "ready" && src && mode !== "pick") src.setData(toGeoJSON(reports));
  }, [reports, phase, mode]);

  useEffect(() => {
    if (phase === "ready" && mapRef.current) relabel(mapRef.current, lang);
  }, [lang, phase]);

  // Keep the selected marker visible above the info panel (pan only; never zoom on a click).
  useEffect(() => {
    const map = mapRef.current;
    if (phase !== "ready" || !map || !currentId) return;
    const r = reports.find((x) => x.id === currentId);
    if (!r) return;
    const pt = map.project([r.lng, r.lat]);
    const h = map.getContainer().clientHeight;
    const w = map.getContainer().clientWidth;
    if (!map.getBounds().contains([r.lng, r.lat]) || pt.y > h - 230 || pt.y < 40 || pt.x < 30 || pt.x > w - 30) {
      map.easeTo({ center: [r.lng, r.lat], offset: [0, -Math.min(110, h / 4)], duration: reducedMotion() ? 0 : 450 });
    }
    for (const [key, m] of markers.current) m.getElement().style.zIndex = key === `r${currentId}` ? "5" : "";
  }, [currentId, phase, reports, items]);

  // Escape closes the info panel.
  useEffect(() => {
    if (!currentId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") select(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [currentId, select]);

  // External pick changes (e.g. search result) move the map.
  useEffect(() => {
    const map = mapRef.current;
    if (mode !== "pick" || phase !== "ready" || !map || !pick) return;
    const c = map.getCenter();
    if (Math.abs(c.lng - pick.lng) > 1e-6 || Math.abs(c.lat - pick.lat) > 1e-6)
      map.jumpTo({ center: [pick.lng, pick.lat], zoom: Math.max(map.getZoom(), 15) });
  }, [pick, mode, phase]);

  const locate = () => {
    if (!navigator.geolocation) {
      onLocateError?.(t("Таны төхөөрөмж байршил тодорхойлохгүй байна.", "Your device can't share its location."));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p = { lng: pos.coords.longitude, lat: pos.coords.latitude };
        if (!inServiceArea(p)) {
          onLocateError?.(
            t(
              "Та Улаанбаатараас гадна байна. Газрын зургийг хөдөлгөж байршлаа сонгоно уу.",
              "You appear to be outside Ulaanbaatar. Move the map to choose the spot instead.",
            ),
          );
          return;
        }
        const map = mapRef.current;
        const ml = libRef.current;
        if (!map || !ml) {
          if (mode === "pick") onPick?.({ ...p, accuracyM: Math.round(pos.coords.accuracy) });
          return;
        }
        if (mode === "pick") pendingAccuracy.current = Math.round(pos.coords.accuracy);
        else {
          const el = document.createElement("div");
          el.className = "size-4 rounded-full border-[3px] border-white bg-[var(--focus)] shadow-md";
          el.setAttribute("aria-label", t("Таны байршил", "Your location"));
          userDot.current?.remove();
          userDot.current = new ml.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map);
        }
        map.easeTo({ center: [p.lng, p.lat], zoom: 16, duration: reducedMotion() ? 0 : 450 });
      },
      (e) => {
        setLocating(false);
        onLocateError?.(
          e.code === e.PERMISSION_DENIED
            ? t("Байршлын зөвшөөрөл олгоогүй байна. Газрын зургаас сонгоно уу.", "Location permission was denied. Choose the spot on the map instead.")
            : t("Байршлыг тодорхойлж чадсангүй. Дахин оролдох эсвэл газрын зургаас сонгоно уу.", "Couldn't get your location. Try again or choose on the map."),
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  };

  const zoomCluster = async (clusterId: number, lngLat: [number, number]) => {
    const map = mapRef.current;
    const src = map?.getSource("reports") as GeoJSONSource | undefined;
    if (!map || !src) return;
    const z = await src.getClusterExpansionZoom(clusterId).catch(() => map.getZoom() + 2);
    map.easeTo({ center: lngLat, zoom: Math.min(z, 17), duration: reducedMotion() ? 0 : 450 });
  };

  const selected = currentId ? reports.find((r) => r.id === currentId) : undefined;

  return (
    <div className={cn("relative overflow-hidden bg-surface-sunken", className)}>
      {/* Inline style: maplibre-gl.css sets `.maplibregl-map { position: relative }`, which beats Tailwind's layered utilities. */}
      <div ref={container} style={{ position: "absolute", inset: 0 }} role="region" aria-label={ariaLabel} />

      {items.map((it) =>
        createPortal(
          it.kind === "cluster" ? (
            <MapClusterView count={it.count} breakdown={it.breakdown} onClick={() => zoomCluster(it.clusterId, it.lngLat)} />
          ) : (
            (() => {
              const r = reports.find((x) => x.id === it.id);
              return (
                <MapMarkerView
                  status={it.status}
                  icon={catalog.icon(it.category)}
                  selected={currentId === it.id}
                  label={
                    r
                      ? `${r.ref}, ${catalog.label(r.category, lang)}, ${catalog.subLabel(r.category, r.subcategory, lang)}, ${pickBi(STATUS_META[r.status].label)}, ${placeOf(r, lang)}`
                      : it.id
                  }
                  onClick={() => select(currentId === it.id ? null : it.id)}
                  as={mode === "static" ? "span" : "button"}
                />
              );
            })()
          ),
          it.el,
          it.key,
        ),
      )}

      {mode === "pick" && phase !== "error" && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full" aria-hidden>
          <MapPin className="size-11 fill-brand text-surface drop-shadow-md" strokeWidth={1.5} />
        </div>
      )}

      {phase === "loading" && <div className="absolute inset-0 fx-skeleton" aria-hidden />}
      {phase === "error" && (
        <div className="absolute inset-0 grid place-items-center bg-surface-sunken p-6 text-center">
          <div>
            <WifiOff aria-hidden className="mx-auto size-6 text-ink-muted" strokeWidth={1.5} />
            <p className="mt-2 text-label font-[600]">{t("Газрын зураг ачаалагдсангүй", "The map couldn't load")}</p>
            <p className="mt-1 max-w-[36ch] text-small text-ink-muted">
              {mode === "pick"
                ? t("Сүлжээгээ шалгана уу. “Миний байршил” товчийг ашиглаж болно.", "Check your connection. You can still use “My location”.")
                : t("Сүлжээгээ шалгана уу. Жагсаалтад ижил мэдээллүүд харагдаж байна.", "Check your connection. The list shows the same reports.")}
            </p>
          </div>
        </div>
      )}

      {mode !== "static" && (
        <button
          type="button"
          onClick={locate}
          className="absolute bottom-[calc(var(--sheet,0px)+2rem)] right-2.5 inline-flex h-10 items-center gap-2 rounded-sm bg-surface-overlay px-3 text-small font-[600] text-ink shadow-md hover:bg-surface-sunken [@media(pointer:coarse)]:h-11"
        >
          <LocateFixed aria-hidden className={cn("size-5", locating && "fx-spin")} strokeWidth={1.75} />
          {mode === "pick" ? t("Миний байршил", "Use my location") : <span className="sr-only sm:not-sr-only">{t("Миний байршил", "My location")}</span>}
        </button>
      )}

      {showLegend && phase === "ready" && (
        <div className="absolute left-2.5 top-2.5">
          <button
            type="button"
            aria-expanded={legendOpen}
            onClick={() => setLegendOpen((o) => !o)}
            className="inline-flex h-9 items-center gap-1.5 rounded-sm bg-surface-overlay px-2.5 text-caption font-[600] shadow-md hover:bg-surface-sunken md:hidden"
          >
            <Layers aria-hidden className="size-4" /> {t("Тайлбар", "Legend")}
          </button>
          <MapLegend statuses={legendStatuses} className={cn("mt-2 md:mt-0", legendOpen ? "block" : "hidden md:block")} />
        </div>
      )}

      {schematicLabel && (
        <span className="absolute bottom-2 left-2 rounded-xs bg-surface-overlay/90 px-1.5 py-0.5 text-[12px] text-ink-muted">
          {schematicLabel}
        </span>
      )}

      {selected && mode === "browse" && (
        <div className="pointer-events-none absolute inset-x-2.5 bottom-[calc(var(--sheet,0px)+0.625rem)] z-10 flex justify-center md:bottom-4">
          <section
            aria-label={t("Сонгосон мэдээлэл", "Selected report")}
            className="pointer-events-auto w-full max-w-[400px] rounded-md border border-line bg-surface-overlay p-3.5 shadow-md fx-rise"
          >
            <div className="flex items-start gap-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                <StatusBadge status={selected.status} reason={selected.closureReason} />
                {!compact && <PriorityBadge priority={selected.priority} />}
                <span className="text-caption font-[600] text-ink-subtle tnum">{selected.ref}</span>
              </div>
              <button
                type="button"
                onClick={() => select(null)}
                aria-label={t("Хаах", "Close")}
                className="-mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-sm text-ink-muted hover:bg-surface-sunken [@media(pointer:coarse)]:size-11"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
            {compact ? (
              <>
                <p className="mt-1.5 text-label font-[650] leading-snug">{catalog.subLabel(selected.category, selected.subcategory, lang)}</p>
                <p className="mt-0.5 text-small text-ink-muted">
                  {[placeOf(selected, lang), pickBi(DISTRICT_META[selected.district].label), timeAgo(selected.createdAt, now, lang)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {detailHref && (
                  <Link
                    href={detailHref(selected.id)}
                    className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-sm bg-brand text-label font-[600] text-on-brand hover:bg-brand-hover"
                  >
                    {t("Нээх", "Open")} <ArrowRight aria-hidden className="size-4" />
                  </Link>
                )}
              </>
            ) : (
              <>
                <p className="mt-1.5 text-label font-[650] leading-snug">{catalog.subLabel(selected.category, selected.subcategory, lang)}</p>
                <CategoryTag category={selected.category} className="mt-0.5" />
                <p className="mt-1.5 text-small text-ink">
                  {[placeOf(selected, lang), pickBi(DISTRICT_META[selected.district].label)].filter(Boolean).join(" · ")}
                </p>
                <p className="text-caption text-ink-subtle">
                  {t("Мэдээлсэн", "Reported")} {formatDateTime(selected.createdAt, lang)} · {timeAgo(selected.createdAt, now, lang)}
                </p>
                <p className="mt-1.5 line-clamp-2 text-small text-ink-muted">{descriptionOf(selected, lang)}</p>
                {detailHref && (
                  <Link
                    href={detailHref(selected.id)}
                    className="mt-2 inline-flex items-center gap-1 text-small font-[650] text-brand hover:underline"
                  >
                    {t("Бүрэн мэдээллийг нээх", "Open full report")} <ArrowRight aria-hidden className="size-4" />
                  </Link>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {/* Hidden live summary of what the map shows, for screen readers. */}
      <p className="sr-only" aria-live="polite">
        {selected ? `${selected.ref} ${t("сонгогдсон", "selected")}` : ""}
      </p>
    </div>
  );
}
