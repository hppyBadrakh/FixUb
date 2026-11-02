// Lookups over the editable category tree in demo state.
import type { LucideIcon } from "lucide-react";
import { ICONS } from "./meta";
import type { CategoryDef, Lang, SubcategoryDef } from "./types";

export interface Catalog {
  list: CategoryDef[];
  get(id: string): CategoryDef | undefined;
  label(id: string, lang: Lang): string;
  icon(id: string): LucideIcon;
  sub(catId: string, subId: string): SubcategoryDef | undefined;
  subLabel(catId: string, subId: string, lang: Lang): string;
}

const REMOVED = { mn: "Устгасан ангилал", en: "Removed category" };

export function makeCatalog(categories: CategoryDef[]): Catalog {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return {
    list: categories,
    get: (id) => byId.get(id),
    label: (id, lang) => byId.get(id)?.name[lang] ?? REMOVED[lang],
    icon: (id) => ICONS[byId.get(id)?.icon ?? "ellipsis"] ?? ICONS.ellipsis,
    sub: (catId, subId) => byId.get(catId)?.subcategories.find((s) => s.id === subId),
    subLabel: (catId, subId, lang) =>
      byId.get(catId)?.subcategories.find((s) => s.id === subId)?.name[lang] ?? (lang === "mn" ? "Тодорхойгүй" : "Unspecified"),
  };
}
