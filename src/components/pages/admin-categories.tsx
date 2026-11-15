"use client";

// REFERENCE EXAMPLE — a converted screen. The pattern for every screen:
//
//   <CategoriesEditor>       the screen's UI, unchanged. It gets its data and a save function
//                            as props and doesn't know where they come from.
//   <AdminCategoriesApi>     real app: reads with useApi() (SWR), writes with a server action,
//                            then mutate() to re-read.
//   <AdminCategoriesDemo>    the old browser-only code (useStore). Kept so the demo still works
//                            without a database; deleted in week 4.
//   <AdminCategories>        picks one: `server.configured` says whether there is a database.
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Banner, PageSkeleton, useToast } from "@/components/ui/feedback";
import { Select, TextField } from "@/components/ui/form";
import { Card } from "@/components/ui/overlay";
import { useApi } from "@/lib/api/hooks";
import type { CategoriesResponse } from "@/lib/api/types";
import { saveCategories as saveCategoriesDemo, uid } from "@/lib/domain/actions";
import { useT } from "@/lib/i18n";
import { ICONS } from "@/lib/meta";
import { useStore } from "@/lib/store";
import type { CategoryDef, IconKey } from "@/lib/types";
import { saveCategories } from "@/server/actions/categories";
import type { ErrorCode } from "@/server/errors";

const ICON_LABELS: Record<IconKey, { mn: string; en: string }> = {
  road: { mn: "Зам", en: "Road" },
  footprints: { mn: "Явган зам", en: "Footpath" },
  lightbulb: { mn: "Гэрэл", en: "Light" },
  trash: { mn: "Хог", en: "Waste" },
  droplets: { mn: "Ус", en: "Water" },
  landmark: { mn: "Байгууламж", en: "Facility" },
  trees: { mn: "Мод", en: "Trees" },
  signpost: { mn: "Тэмдэг", en: "Sign" },
  zap: { mn: "Цахилгаан", en: "Electricity" },
  bus: { mn: "Автобус", en: "Bus" },
  ellipsis: { mn: "Бусад", en: "Other" },
};

function move<T>(list: T[], i: number, by: -1 | 1): T[] {
  const j = i + by;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Picks the data source. Everything below it is either the real app or the browser-only demo. */
export function AdminCategories() {
  const { ready, server } = useStore();
  if (!ready) return <PageSkeleton />;
  return server.configured ? <AdminCategoriesApi /> : <AdminCategoriesDemo />;
}

/* ---------- Real app: GET /api/v1/categories + the saveCategories server action ---------- */

function AdminCategoriesApi() {
  const { t } = useT();
  const { data, error, isLoading, mutate } = useApi<CategoriesResponse>("/api/v1/categories");

  // The API adds report counts to the demo's CategoryDef; the editor wants the two apart.
  const saved = useMemo<CategoryDef[]>(
    () =>
      (data?.categories ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        subcategories: c.subcategories.map((sc) => ({ id: sc.id, name: sc.name })),
      })),
    [data],
  );
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of data?.categories ?? []) {
      m.set(c.id, c.reportCount);
      for (const sc of c.subcategories) m.set(`${c.id}/${sc.id}`, sc.reportCount);
    }
    return m;
  }, [data]);

  if (isLoading) return <PageSkeleton />;
  if (error || !data) {
    return (
      <div className="mx-auto max-w-[1080px] px-4 py-6 md:px-6 lg:px-8">
        <Banner
          tone="danger"
          title={t("Ангиллыг ачаалж чадсангүй", "Couldn't load the categories")}
          actions={<Button onClick={() => mutate()}>{t("Дахин оролдох", "Try again")}</Button>}
        >
          {error?.message}
        </Banner>
      </div>
    );
  }

  return (
    <CategoriesEditor
      saved={saved}
      usage={usage}
      onSave={async (categories) => {
        // The server action validates, checks the role and writes in one transaction.
        const res = await saveCategories({ categories });
        if (!res.ok) return res.error;
        await mutate(); // re-read the tree (and the counts) from the database
        return null;
      }}
    />
  );
}

/* ---------- Browser-only demo (no database): unchanged behaviour ---------- */

function AdminCategoriesDemo() {
  const { state, run } = useStore();
  // How many reports use each category / subcategory (those can be renamed but not removed).
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of state.reports) {
      m.set(r.category, (m.get(r.category) ?? 0) + 1);
      m.set(`${r.category}/${r.subcategory}`, (m.get(`${r.category}/${r.subcategory}`) ?? 0) + 1);
    }
    return m;
  }, [state.reports]);

  return (
    <CategoriesEditor
      saved={state.categories}
      usage={usage}
      onSave={async (categories) => {
        const res = run((s, u) => saveCategoriesDemo(s, u, categories));
        return res.ok ? null : res.error;
      }}
    />
  );
}

/* ---------- The screen itself: the same UI for both data sources ---------- */

function CategoriesEditor({
  saved,
  usage,
  onSave,
}: {
  /** The tree as it is stored now. */
  saved: CategoryDef[];
  /** Report counts, keyed by `category` and `category/subcategory`. */
  usage: Map<string, number>;
  /** Saves the tree. Resolves to null on success, or to the error code. */
  onSave: (categories: CategoryDef[]) => Promise<ErrorCode | null>;
}) {
  const { t, pick } = useT();
  const toast = useToast();
  const [draft, setDraft] = useState<CategoryDef[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const list = draft ?? saved;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);

  const update = (fn: (cats: CategoryDef[]) => CategoryDef[]) => {
    setError(null);
    setDraft(fn(list));
  };
  const patchCat = (i: number, patch: Partial<CategoryDef>) => update((cs) => cs.map((c, k) => (k === i ? { ...c, ...patch } : c)));

  const errorText = (code: ErrorCode) => {
    switch (code) {
      case "in_use":
        return t("Мэдээлэлд ашиглагдаж буй ангиллыг устгах боломжгүй.", "A category or subcategory that reports use can't be removed.");
      case "signed_out":
        return t("Таны нэвтрэлт дууссан байна. Дахин нэвтэрнэ үү.", "Your session has ended. Sign in again.");
      case "forbidden":
        return t("Ангиллыг зөвхөн FixUB админ өөрчилнө.", "Only a FixUB admin can change the categories.");
      case "invalid_input":
        return t(
          "Бүх ангилал, дэд ангилалд монгол, англи нэр оруулна уу. Ангилал бүр дор хаяж нэг дэд ангилалтай байна.",
          "Give every category and subcategory a Mongolian and an English name. Each category needs at least one subcategory.",
        );
      default:
        return t("Серверийн алдаа гарлаа. Дахин оролдоно уу.", "Something went wrong on the server. Try again.");
    }
  };

  const save = async () => {
    setSaving(true);
    let problem: ErrorCode | null;
    try {
      problem = await onSave(list);
    } catch {
      problem = "internal"; // the request itself failed (offline, server down)
    }
    setSaving(false);
    if (problem) {
      setError(errorText(problem));
      return;
    }
    setError(null);
    setDraft(null);
    toast({ tone: "success", title: t("Ангиллыг хадгаллаа", "Categories saved"), body: t("Мэдээлэх маягт шууд шинэчлэгдлээ.", "The report form uses them right away.") });
  };

  return (
    <div className="mx-auto max-w-[1080px] space-y-5 px-4 py-6 pb-28 md:px-6 lg:px-8">
      <div>
        <h1 className="text-title-1 font-[650] tracking-tight">{t("Ангилал, дэд ангилал", "Categories and subcategories")}</h1>
        <p className="max-w-[70ch] text-small text-ink-muted">
          {t(
            "Иргэд мэдээлэхдээ эхлээд үндсэн ангилал, дараа нь дэд ангиллыг сонгоно. Нэрийг өөрчлөх, дараалал солих, нэмэх боломжтой. Мэдээлэлд ашиглагдаж буйг устгахгүй.",
            "Citizens pick a main category, then a subcategory. You can rename, reorder and add them. Ones that reports already use can't be removed.",
          )}
        </p>
      </div>

      {error && (
        <Banner tone="danger" title={t("Хадгалсангүй", "Not saved")}>
          {error}
        </Banner>
      )}

      {list.map((c, i) => {
        const Icon = ICONS[c.icon] ?? ICONS.ellipsis;
        const used = usage.get(c.id) ?? 0;
        return (
          <Card
            key={c.id}
            title={
              <span className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-sm bg-surface-sunken text-ink-muted">
                  <Icon aria-hidden className="size-5" strokeWidth={1.75} />
                </span>
                {pick(c.name) || t("Шинэ ангилал", "New category")}
              </span>
            }
            subtitle={t(`${used} мэдээлэл`, `${used} report${used === 1 ? "" : "s"}`)}
            actions={
              <>
                <IconButton icon={ArrowUp} size="sm" label={t("Дээш", "Move up")} disabled={i === 0} onClick={() => update((cs) => move(cs, i, -1))} />
                <IconButton icon={ArrowDown} size="sm" label={t("Доош", "Move down")} disabled={i === list.length - 1} onClick={() => update((cs) => move(cs, i, 1))} />
                <IconButton
                  icon={Trash2}
                  size="sm"
                  label={used ? t("Ашиглагдаж байгаа тул устгах боломжгүй", "In use — can't be removed") : t("Ангиллыг устгах", "Remove category")}
                  disabled={used > 0}
                  onClick={() => update((cs) => cs.filter((_, k) => k !== i))}
                />
              </>
            }
          >
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_12rem]">
              <TextField label={t("Нэр (монгол)", "Name (Mongolian)")} value={c.name.mn} onChange={(v) => patchCat(i, { name: { ...c.name, mn: v } })} />
              <TextField label={t("Нэр (англи)", "Name (English)")} value={c.name.en} onChange={(v) => patchCat(i, { name: { ...c.name, en: v } })} />
              <Select
                label={t("Дүрс", "Icon")}
                value={c.icon}
                onChange={(v) => patchCat(i, { icon: v as IconKey })}
                options={(Object.keys(ICONS) as IconKey[]).map((k) => ({ value: k, label: pick(ICON_LABELS[k]) }))}
              />
            </div>

            <p className="mt-5 text-eyebrow font-[650] uppercase tracking-wide text-ink-subtle">{t("Дэд ангилал", "Subcategories")}</p>
            <ul className="mt-2 space-y-2">
              {c.subcategories.map((sc, j) => {
                const subUsed = usage.get(`${c.id}/${sc.id}`) ?? 0;
                const patchSub = (name: CategoryDef["name"]) =>
                  patchCat(i, { subcategories: c.subcategories.map((x, k) => (k === j ? { ...x, name } : x)) });
                return (
                  <li key={sc.id} className="grid items-end gap-2 rounded-sm bg-surface-sunken/60 p-2 sm:grid-cols-[1fr_1fr_auto]">
                    <TextField label={t("Монгол", "Mongolian")} value={sc.name.mn} onChange={(v) => patchSub({ ...sc.name, mn: v })} />
                    <TextField label={t("Англи", "English")} value={sc.name.en} onChange={(v) => patchSub({ ...sc.name, en: v })} />
                    <div className="flex items-center gap-1 pb-0.5">
                      <span className="mr-1 min-w-12 text-right text-caption text-ink-subtle tnum">{subUsed}</span>
                      <IconButton icon={ArrowUp} size="sm" label={t("Дээш", "Move up")} disabled={j === 0} onClick={() => patchCat(i, { subcategories: move(c.subcategories, j, -1) })} />
                      <IconButton
                        icon={ArrowDown}
                        size="sm"
                        label={t("Доош", "Move down")}
                        disabled={j === c.subcategories.length - 1}
                        onClick={() => patchCat(i, { subcategories: move(c.subcategories, j, 1) })}
                      />
                      <IconButton
                        icon={Trash2}
                        size="sm"
                        label={subUsed ? t("Ашиглагдаж байгаа тул устгах боломжгүй", "In use — can't be removed") : t("Дэд ангиллыг устгах", "Remove subcategory")}
                        disabled={subUsed > 0 || c.subcategories.length === 1}
                        onClick={() => patchCat(i, { subcategories: c.subcategories.filter((_, k) => k !== j) })}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
            <Button
              size="sm"
              variant="quiet"
              icon={Plus}
              className="mt-2"
              onClick={() => patchCat(i, { subcategories: [...c.subcategories, { id: uid("sub-"), name: { mn: "", en: "" } }] })}
            >
              {t("Дэд ангилал нэмэх", "Add subcategory")}
            </Button>
          </Card>
        );
      })}

      <Button
        icon={Plus}
        onClick={() =>
          update((cs) => [...cs, { id: uid("cat-"), name: { mn: "", en: "" }, icon: "ellipsis", subcategories: [{ id: uid("sub-"), name: { mn: "", en: "" } }] }])
        }
      >
        {t("Ангилал нэмэх", "Add category")}
      </Button>

      {/* Sticky save bar while there are unsaved changes. */}
      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface px-4 py-3 shadow-lg lg:left-[248px]">
          <div className="mx-auto flex max-w-[1080px] items-center justify-end gap-2">
            <p className="mr-auto text-small text-ink-muted">{t("Хадгалаагүй өөрчлөлт байна", "You have unsaved changes")}</p>
            <Button icon={RotateCcw} disabled={saving} onClick={() => (setDraft(null), setError(null))}>
              {t("Болих", "Discard")}
            </Button>
            <Button variant="primary" icon={Save} loading={saving} onClick={save}>
              {t("Хадгалах", "Save categories")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
