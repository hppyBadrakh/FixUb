// Small offline gazetteer of well-known Ulaanbaatar places for the location search.
// (No geocoding API is used in the demo.) Coordinates are approximate.
import type { Bi, LngLat } from "./types";

export const PLACES: (Bi & LngLat)[] = [
  { mn: "Сүхбаатарын талбай", en: "Sükhbaatar Square", lng: 106.9176, lat: 47.9188 },
  { mn: "Энхтайваны өргөн чөлөө", en: "Peace Avenue", lng: 106.9105, lat: 47.9167 },
  { mn: "Улсын их дэлгүүр", en: "State Department Store", lng: 106.9046, lat: 47.9164 },
  { mn: "Төв шуудан", en: "Central Post Office", lng: 106.9128, lat: 47.9176 },
  { mn: "Чингисийн өргөн чөлөө", en: "Chinggis Avenue", lng: 106.9218, lat: 47.9125 },
  { mn: "Зайсан", en: "Zaisan", lng: 106.9161, lat: 47.8885 },
  { mn: "Гандан хийд", en: "Gandan Monastery", lng: 106.8949, lat: 47.9216 },
  { mn: "Нарантуул зах", en: "Narantuul market", lng: 106.9549, lat: 47.9095 },
  { mn: "Баянзүрхийн товчоо", en: "Bayanzürkh tovchoo", lng: 106.9893, lat: 47.9228 },
  { mn: "13-р хороолол", en: "13th micro-district", lng: 106.9571, lat: 47.9208 },
  { mn: "Сансар", en: "Sansar", lng: 106.9398, lat: 47.9262 },
  { mn: "Драгон төв", en: "Dragon bus terminal", lng: 106.8569, lat: 47.9168 },
  { mn: "3, 4-р хороолол", en: "3rd–4th micro-district", lng: 106.8873, lat: 47.9142 },
  { mn: "Барс зах", en: "Bars market", lng: 106.8781, lat: 47.9209 },
  { mn: "Толгойт", en: "Tolgoit", lng: 106.8385, lat: 47.9152 },
  { mn: "Баянхошуу", en: "Bayankhoshuu", lng: 106.8414, lat: 47.9563 },
  { mn: "Яармаг", en: "Yarmag", lng: 106.8318, lat: 47.8663 },
  { mn: "Буянт-Ухаа", en: "Buyant-Ukhaa", lng: 106.7894, lat: 47.8563 },
  { mn: "Хүннү Молл", en: "Hunnu Mall", lng: 106.8402, lat: 47.8762 },
  { mn: "Шангри-Ла төв", en: "Shangri-La Centre", lng: 106.9218, lat: 47.9133 },
  { mn: "Офицеруудын ордон", en: "Officers' Palace", lng: 106.9563, lat: 47.9145 },
  { mn: "120 мянгат", en: "120 Myangat", lng: 106.9512, lat: 47.9165 },
  { mn: "Дэнжийн мянга", en: "Denjiin Myanga", lng: 106.9276, lat: 47.9311 },
  { mn: "Их тойруу", en: "Ikh Toiruu", lng: 106.9128, lat: 47.9233 },
  { mn: "Сөүлийн гудамж", en: "Seoul Street", lng: 106.9086, lat: 47.9142 },
  { mn: "Ард Аюушийн өргөн чөлөө", en: "Ard Ayush Avenue", lng: 106.8573, lat: 47.9195 },
  { mn: "Сэлбэ гол", en: "Selbe river", lng: 106.9227, lat: 47.9364 },
  { mn: "Дүнжингарав", en: "Dunjingarav", lng: 106.8722, lat: 47.9043 },
  { mn: "Нарны зам", en: "Narny Road", lng: 106.9452, lat: 47.9118 },
  { mn: "Шар хад", en: "Shar Khad", lng: 106.9705, lat: 47.9301 },
];

export function searchPlaces(q: string): (Bi & LngLat)[] {
  const s = q.trim().toLowerCase();
  if (s.length < 2) return [];
  return PLACES.filter((p) => p.mn.toLowerCase().includes(s) || p.en.toLowerCase().includes(s)).slice(0, 6);
}
