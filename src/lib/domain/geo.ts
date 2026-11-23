import { DISTRICT_META, DISTRICT_ORDER, SERVICE_AREA } from "../meta";
import type { DistrictId, LngLat } from "../types";

/** Great-circle distance in metres (haversine). */
export function distanceM(a: LngLat, b: LngLat): number {
  const R = 6371008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function inServiceArea(p: LngLat): boolean {
  return (
    p.lng >= SERVICE_AREA.west &&
    p.lng <= SERVICE_AREA.east &&
    p.lat >= SERVICE_AREA.south &&
    p.lat <= SERVICE_AREA.north
  );
}

/**
 * Approximate district from the nearest district centre. A first approximation;
 * the real system would use district polygons in PostGIS.
 */
export function guessDistrict(p: LngLat): DistrictId {
  let best: DistrictId = "sukhbaatar";
  let bestD = Infinity;
  for (const id of DISTRICT_ORDER) {
    const d = distanceM(p, DISTRICT_META[id].center);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}
