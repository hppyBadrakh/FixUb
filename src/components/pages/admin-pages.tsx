"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Building2, ChevronLeft, ChevronRight, Eye, EyeOff, Flag, Inbox, Pencil, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { EmptyState, PageSkeleton, SampleDataPill, useToast } from "@/components/ui/feedback";
import { FilterChip, SegmentedControl, Select, TextField } from "@/components/ui/form";
import { Card, Dialog, Sheet } from "@/components/ui/overlay";
import { ReportTable, sortReports, type SortKey } from "@/components/fixub/data";
import { CategoryTag, StatusBadge } from "@/components/fixub/status";
import { moderate, restoreSnapshot, uid, upsertOrganization } from "@/lib/domain/actions";
import { descriptionOf, isOpen, placeOf } from "@/lib/domain/metrics";
import { timeAgo } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { DISTRICT_META, DISTRICT_ORDER, FLAG_REASON_LABEL, OPEN_STATUSES, PRIORITY_META, PRIORITY_ORDER, STATUS_META, STATUS_ORDER } from "@/lib/meta";
import { useNow, useStore } from "@/lib/store";
import type { CategorySlug, FlagReason, Organization, Report } from "@/lib/types";
import { matchesQuery } from "./home";

const PAGE = 20;

/* ================= Reports ================= */

export function AdminReports() {
  const { ready, state, freshIds, catalog } = useStore();
  const { lang, t, pick } = useT();
  const now = useNow();
  const [tab, setTab] = useState<"review" | "open" | "done" | "hidden">("review");
  const [cat, setCat] = useState("all");
  const [sub, setSub] = useState("all");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [district, setDistrict] = useState("all");
  const [org, setOrg] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "priority", dir: "desc" });
  const [page, setPage] = useState(0);

  const tabRows = useMemo(() => {
    const r = state.reports;
    return {
      // Needs the admin: no priority yet, or no responsible organization yet.
      review: r.filter((x) => x.visibility === "visible" && isOpen(x) && (!x.priority || !x.organizationId)),
      open: r.filter((x) => x.visibility === "visible" && isOpen(x)),
      done: r.filter((x) => x.visibility === "visible" && !isOpen(x)),
      hidden: r.filter((x) => x.visibility === "hidden"),
    };
  }, [state.reports]);

  const rows = useMemo(
    () =>
      sortReports(
        tabRows[tab].filter(
          (r) =>
            (cat === "all" || r.category === cat) &&
            (sub === "all" || r.subcategory === sub) &&
            (status === "all" || r.status === status) &&
            (priority === "all" || (priority === "pending" ? !r.priority : r.priority === priority)) &&
            (district === "all" || r.district === district) &&
            (org === "all" || (org === "none" ? !r.organizationId : r.organizationId === org)) &&
            matchesQuery(r, q.trim(), catalog),
        ),
        sort,
        lang,
        catalog,
      ),
    [tabRows, tab, cat, sub, status, priority, district, org, q, sort, lang, catalog],
  );

  if (!ready) return <PageSkeleton />;
  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE);
  const reset = () => setPage(0);

  return (
    <div className="mx-auto max-w-[1280px] space-y-5 px-4 py-6 md:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-title-1 font-[650] tracking-tight">{t("Мэдээллүүд", "Reports")}</h1>
          <p className="text-small text-ink-muted">
            {t("Ирсэн мэдээллийг хянаж, ач холбогдлыг тогтоон хариуцагчид хуваарилна.", "Review incoming reports, set their priority and assign them.")}
          </p>
        </div>
        <SampleDataPill />
      </div>

      <SegmentedControl
        label={t("Дараалал", "Queue")}
        value={tab}
        onChange={(v) => {
          setTab(v);
          reset();
        }}
        options={[
          { value: "review", label: t(`Хянах (${tabRows.review.length})`, `Needs review (${tabRows.review.length})`) },
          { value: "open", label: t(`Нээлттэй (${tabRows.open.length})`, `Open (${tabRows.open.length})`) },
          { value: "done", label: t(`Шийдвэрлэсэн, хаасан (${tabRows.done.length})`, `Resolved & closed (${tabRows.done.length})`) },
          { value: "hidden", label: t(`Нуусан (${tabRows.hidden.length})`, `Hidden (${tabRows.hidden.length})`) },
        ]}
        className="max-w-full flex-wrap"
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <TextField
          label={t("Хайх", "Search")}
          value={q}
          onChange={(v) => {
            setQ(v);
            reset();
          }}
          onClear={() => setQ("")}
          placeholder={t("Дугаар, газар, тайлбар", "Reference, place, text")}
        />
        <Select
          label={t("Ангилал", "Category")}
          value={cat}
          onChange={(v) => {
            setCat(v);
            setSub("all");
            reset();
          }}
          options={[{ value: "all", label: t("Бүх ангилал", "All categories") }, ...catalog.list.map((c) => ({ value: c.id, label: pick(c.name) }))]}
        />
        <Select
          label={t("Дэд ангилал", "Subcategory")}
          value={sub}
          onChange={(v) => {
            setSub(v);
            reset();
          }}
          options={[
            { value: "all", label: cat === "all" ? t("Эхлээд ангилал сонгоно", "Choose a category first") : t("Бүгд", "All") },
            ...(catalog.get(cat)?.subcategories ?? []).map((x) => ({ value: x.id, label: pick(x.name) })),
          ]}
        />
        <Select
          label={t("Төлөв", "Status")}
          value={status}
          onChange={(v) => {
            setStatus(v);
            reset();
          }}
          options={[{ value: "all", label: t("Бүх төлөв", "All statuses") }, ...STATUS_ORDER.map((x) => ({ value: x, label: pick(STATUS_META[x].label) }))]}
        />
        <Select
          label={t("Ач холбогдол", "Priority")}
          value={priority}
          onChange={(v) => {
            setPriority(v);
            reset();
          }}
          options={[
            { value: "all", label: t("Бүгд", "All") },
            { value: "pending", label: t("Хянагдаж байна", "Pending review") },
            ...PRIORITY_ORDER.map((x) => ({ value: x, label: pick(PRIORITY_META[x].label) })),
          ]}
        />
        <Select
          label={t("Дүүрэг", "District")}
          value={district}
          onChange={(v) => {
            setDistrict(v);
            reset();
          }}
          options={[{ value: "all", label: t("Бүх дүүрэг", "All districts") }, ...DISTRICT_ORDER.map((d) => ({ value: d, label: pick(DISTRICT_META[d].label) }))]}
        />
        <Select
          label={t("Хариуцагч", "Organization")}
          value={org}
          onChange={(v) => {
            setOrg(v);
            reset();
          }}
          options={[
            { value: "all", label: t("Бүгд", "All") },
            { value: "none", label: t("Хуваарилаагүй", "Unassigned") },
            ...state.organizations.map((o) => ({ value: o.id, label: pick(o.name) })),
          ]}
        />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-caption text-ink-subtle">
          {t("Шүүлтүүр нь доорх хүснэгтэд хамаарна. Баганын гарчиг дээр дарж эрэмбэлнэ.", "Filters apply to the table below. Select a column heading to sort.")}
        </p>
        <Select
          label={t("Эрэмбэлэх", "Sort by")}
          size="sm"
          className="w-56"
          value={`${sort.key}:${sort.dir}`}
          onChange={(v) => {
            const [key, dir] = v.split(":") as [SortKey, "asc" | "desc"];
            setSort({ key, dir });
          }}
          options={[
            { value: "priority:desc", label: t("Ач холбогдол (яаралтай эхэндээ)", "Priority (most urgent first)") },
            { value: "age:desc", label: t("Илгээсэн огноо (хуучин эхэндээ)", "Submitted (oldest first)") },
            { value: "age:asc", label: t("Илгээсэн огноо (шинэ эхэндээ)", "Submitted (newest first)") },
            { value: "status:asc", label: t("Төлөв", "Status") },
            { value: "category:asc", label: t("Ангилал, дэд ангилал", "Category and subcategory") },
            ...(["priority:desc", "age:desc", "age:asc", "status:asc", "category:asc"].includes(`${sort.key}:${sort.dir}`)
              ? []
              : [{ value: `${sort.key}:${sort.dir}`, label: t("Хүснэгтийн эрэмбэ", "Table column") }]),
          ]}
        />
      </div>

      <Card flush>
        {rows.length === 0 ? (
          <EmptyState icon={Inbox} title={tab === "review" ? t("Бүх мэдээлэл хянагдсан", "Everything is reviewed and assigned") : t("Тохирох мэдээлэл алга", "No reports match these filters")} />
        ) : (
          <>
            <ReportTable
              rows={pageRows}
              state={state}
              now={now}
              sort={sort}
              onSort={(k) => setSort((p) => ({ key: k, dir: p.key === k && p.dir === "desc" ? "asc" : "desc" }))}
              hrefFor={(id) => `/admin/reports/${id}`}
              fresh={freshIds}
              caption={t("Мэдээллийн дараалал", "Report queue")}
            />
            <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
              <p className="text-small text-ink-muted tnum">
                {page * PAGE + 1}–{Math.min(rows.length, page * PAGE + PAGE)} {t("/", "of")} {rows.length}
              </p>
              <div className="flex gap-2">
                <Button size="sm" icon={ChevronLeft} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  {t("Өмнөх", "Previous")}
                </Button>
                <Button size="sm" iconEnd={ChevronRight} disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage((p) => p + 1)}>
                  {t("Дараах", "Next")}
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

/* ================= Organizations ================= */

function blankOrg(): Organization {
  return { id: uid("org-"), name: { mn: "", en: "" }, units: [], categories: [], isActive: true };
}

export function AdminOrganizations() {
  const { ready, state, run, catalog } = useStore();
  const { t, pick } = useT();
  const toast = useToast();
  const [editing, setEditing] = useState<Organization | null>(null);
  const [newUnit, setNewUnit] = useState({ mn: "", en: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!ready) return <PageSkeleton />;

  const save = () => {
    if (!editing) return;
    const e: Record<string, string> = {};
    if (!editing.name.mn.trim()) e.mn = t("Монгол нэрийг оруулна уу.", "Enter the Mongolian name.");
    if (!editing.name.en.trim()) e.en = t("Англи нэрийг оруулна уу.", "Enter the English name.");
    setErrors(e);
    if (Object.keys(e).length) return;
    const res = run((s, u) => upsertOrganization(s, u, { ...editing, name: { mn: editing.name.mn.trim(), en: editing.name.en.trim() } }));
    if (res.ok) {
      toast({ tone: "success", title: t("Хадгаллаа", "Saved"), body: editing.name.mn });
      setEditing(null);
    }
  };

  const toggleActive = (o: Organization) => {
    const res = run((s, u) => upsertOrganization(s, u, { ...o, isActive: !o.isActive }));
    if (res.ok) toast({ tone: "success", title: o.isActive ? t("Идэвхгүй болголоо", "Deactivated") : t("Идэвхжүүллээ", "Activated"), body: pick(o.name) });
  };

  return (
    <div className="mx-auto max-w-[1280px] space-y-5 px-4 py-6 md:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-title-1 font-[650] tracking-tight">{t("Байгууллага, засварын баг", "Organizations and repair units")}</h1>
          <p className="max-w-[70ch] text-small text-ink-muted">
            {t(
              "Демо байгууллагууд нь зохиомол бөгөөд аль ч төрийн байгууллагатай холбогдоогүй. Ангилал бүр нэг санал болгох хариуцагчтай.",
              "Demo organizations are fictional and not connected to any government body. Each category has one suggested owner.",
            )}
          </p>
        </div>
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => {
            setErrors({});
            setEditing(blankOrg());
          }}
        >
          {t("Байгууллага нэмэх", "Add organization")}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {state.organizations.map((o) => {
          const open = state.reports.filter((r) => r.organizationId === o.id && OPEN_STATUSES.includes(r.status) && r.visibility === "visible");
          const staff = state.users.filter((u) => u.organizationId === o.id);
          return (
            <Card
              key={o.id}
              title={
                <span className="flex items-center gap-2">
                  <Building2 aria-hidden className="size-5 text-ink-muted" />
                  {pick(o.name)}
                </span>
              }
              subtitle={o.isActive ? `${open.length} ${t("нээлттэй ажил", "open reports")} · ${staff.length} ${t("ажилтан", "staff")}` : t("Идэвхгүй — шинэ хуваарилалт авахгүй", "Inactive — gets no new assignments")}
              actions={
                <>
                  <IconButton
                    icon={Pencil}
                    label={t("Засах", "Edit")}
                    onClick={() => {
                      setErrors({});
                      setEditing(o);
                    }}
                  />
                  <Button size="sm" onClick={() => toggleActive(o)}>
                    {o.isActive ? t("Идэвхгүй болгох", "Deactivate") : t("Идэвхжүүлэх", "Activate")}
                  </Button>
                </>
              }
            >
              <p className="text-eyebrow font-[650] uppercase tracking-wide text-ink-subtle">{t("Засварын баг", "Repair units")}</p>
              <ul className="mt-2 space-y-1.5">
                {o.units.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2 text-small">
                    <span>{pick(u.name)}</span>
                    <span className="text-ink-subtle tnum">
                      {open.filter((r) => r.unitId === u.id).length} {t("нээлттэй", "open")}
                    </span>
                  </li>
                ))}
                {!o.units.length && <li className="text-small text-ink-muted">{t("Баг алга", "No units yet")}</li>}
              </ul>
              <p className="mt-4 text-eyebrow font-[650] uppercase tracking-wide text-ink-subtle">{t("Хариуцах ангилал", "Routed categories")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {o.categories.length ? o.categories.map((c) => <CategoryTag key={c} category={c} boxed />) : <span className="text-small text-ink-muted">—</span>}
              </div>
              {staff.length > 0 && (
                <>
                  <p className="mt-4 text-eyebrow font-[650] uppercase tracking-wide text-ink-subtle">{t("Демо ажилтан", "Demo staff")}</p>
                  <p className="mt-1 text-small text-ink-muted">{staff.map((s) => s.name).join(", ")}</p>
                </>
              )}
            </Card>
          );
        })}
      </div>

      <Sheet
        open={!!editing}
        title={editing && state.organizations.some((o) => o.id === editing.id) ? t("Байгууллага засах", "Edit organization") : t("Байгууллага нэмэх", "Add organization")}
        onClose={() => setEditing(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setEditing(null)}>{t("Болих", "Cancel")}</Button>
            <Button variant="primary" onClick={save}>
              {t("Хадгалах", "Save organization")}
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="space-y-4">
            <TextField label={t("Нэр (монгол)", "Name (Mongolian)")} required value={editing.name.mn} error={errors.mn} onChange={(v) => setEditing({ ...editing, name: { ...editing.name, mn: v } })} />
            <TextField label={t("Нэр (англи)", "Name (English)")} required value={editing.name.en} error={errors.en} onChange={(v) => setEditing({ ...editing, name: { ...editing.name, en: v } })} />
            <fieldset>
              <legend className="text-label font-[550]">{t("Хариуцах ангилал", "Routed categories")}</legend>
              <p className="text-small text-ink-subtle">{t("Сонгосон ангилал өөр байгууллагаас шилжинэ.", "A category you pick moves from its current organization.")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {catalog.list.map((c) => (
                  <FilterChip
                    key={c.id}
                    icon={catalog.icon(c.id)}
                    selected={editing.categories.includes(c.id)}
                    onToggle={(on) =>
                      setEditing({ ...editing, categories: on ? [...editing.categories, c.id] : editing.categories.filter((x: CategorySlug) => x !== c.id) })
                    }
                  >
                    {pick(c.name)}
                  </FilterChip>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-label font-[550]">{t("Засварын баг", "Repair units")}</legend>
              <ul className="mt-2 space-y-1">
                {editing.units.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2 rounded-sm bg-surface-sunken px-3 py-1.5 text-small">
                    {pick(u.name)}
                    <IconButton
                      icon={Trash2}
                      size="sm"
                      label={t(`${u.name.mn} устгах`, `Remove ${u.name.en}`)}
                      onClick={() => setEditing({ ...editing, units: editing.units.filter((x) => x.id !== u.id) })}
                    />
                  </li>
                ))}
              </ul>
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <TextField label={t("Багийн нэр (мн)", "Unit name (mn)")} value={newUnit.mn} onChange={(v) => setNewUnit({ ...newUnit, mn: v })} />
                <TextField label={t("Багийн нэр (en)", "Unit name (en)")} value={newUnit.en} onChange={(v) => setNewUnit({ ...newUnit, en: v })} />
                <Button
                  icon={Plus}
                  disabled={!newUnit.mn.trim()}
                  onClick={() => {
                    setEditing({ ...editing, units: [...editing.units, { id: uid("unit-"), name: { mn: newUnit.mn.trim(), en: newUnit.en.trim() || newUnit.mn.trim() } }] });
                    setNewUnit({ mn: "", en: "" });
                  }}
                >
                  {t("Нэмэх", "Add unit")}
                </Button>
              </div>
            </fieldset>
          </div>
        )}
      </Sheet>
    </div>
  );
}

/* ================= Moderation ================= */

export function AdminModeration() {
  const { ready, state, run, freshIds } = useStore();
  const { lang, t, pick } = useT();
  const toast = useToast();
  const now = useNow();
  const [tab, setTab] = useState<"flagged" | "auto" | "hidden">("flagged");
  const [confirm, setConfirm] = useState<Report | null>(null);

  const lists = useMemo(() => {
    const open = (r: Report) => r.flags.some((f) => f.status === "open");
    return {
      flagged: state.reports.filter((r) => r.visibility === "visible" && open(r)),
      auto: state.reports.filter((r) => r.visibility === "hidden" && open(r)),
      hidden: state.reports.filter((r) => r.visibility === "hidden" && !open(r)),
    };
  }, [state.reports]);

  if (!ready) return <PageSkeleton />;

  const act = (r: Report, action: "hide" | "restore" | "dismiss") => {
    const res = run((s, u, n) => moderate(s, u, r.id, action, n));
    if (!res.ok) return;
    toast({
      tone: "success",
      title:
        action === "hide" ? t(`${r.ref}-ийг нууллаа`, `${r.ref} hidden`) : action === "restore" ? t(`${r.ref}-ийг сэргээлээ`, `${r.ref} restored`) : t("Мэдэгдлийг хаалаа", "Flags dismissed"),
      body: t("Аудитын бүртгэлд орлоо.", "Recorded in the audit log."),
      action: { label: t("Буцаах", "Undo"), onClick: () => run((s, u) => restoreSnapshot(s, u, r)) },
    });
  };

  const rows = lists[tab];
  return (
    <div className="mx-auto max-w-[1080px] space-y-5 px-4 py-6 md:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-title-1 font-[650] tracking-tight">{t("Хяналт", "Moderation")}</h1>
          <p className="max-w-[70ch] text-small text-ink-muted">
            {t(
              "Иргэд мэдэгдсэн агуулга. 3 хүн мэдэгдвэл автоматаар түр нуугдана. Үйлдэл бүр аудитын бүртгэлд орно.",
              "Content flagged by citizens. Three flags hide a report automatically until reviewed. Every action is audited.",
            )}
          </p>
        </div>
        <SampleDataPill />
      </div>
      <SegmentedControl
        label={t("Дараалал", "Queue")}
        value={tab}
        onChange={setTab}
        options={[
          { value: "flagged", label: t(`Мэдэгдсэн (${lists.flagged.length})`, `Flagged (${lists.flagged.length})`) },
          { value: "auto", label: t(`Автоматаар нуусан (${lists.auto.length})`, `Auto-hidden (${lists.auto.length})`) },
          { value: "hidden", label: t(`Нуусан (${lists.hidden.length})`, `Hidden (${lists.hidden.length})`) },
        ]}
      />
      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={ShieldCheck} title={t("Хийх зүйл алга", "All clear")}>
            {t("Энэ дараалалд шалгах мэдээлэл алга.", "Nothing in this queue needs review.")}
          </EmptyState>
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const open = r.flags.filter((f) => f.status === "open");
            const reasons = Object.entries(
              open.reduce<Record<string, number>>((acc, f) => ({ ...acc, [f.reason]: (acc[f.reason] ?? 0) + 1 }), {}),
            );
            return (
              <li key={r.id} className={`rounded-md border border-line bg-surface p-4 shadow-xs ${freshIds.has(r.id) ? "fx-fresh" : ""}`}>
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/reports/${r.id}`} className="font-[650] text-brand tnum hover:underline">
                        {r.ref}
                      </Link>
                      <StatusBadge status={r.status} reason={r.closureReason} />
                      <CategoryTag category={r.category} subcategory={r.subcategory} />
                      <span className="text-caption text-ink-subtle">
                        {placeOf(r, lang)} · {timeAgo(r.createdAt, now, lang)}
                      </span>
                    </div>
                    <p className="mt-2 max-w-[68ch] text-body">{descriptionOf(r, lang)}</p>
                    {reasons.length > 0 && (
                      <p className="mt-2 flex flex-wrap items-center gap-2 text-small text-danger">
                        <Flag aria-hidden className="size-4" />
                        {reasons.map(([k, n]) => `${pick(FLAG_REASON_LABEL[k as FlagReason])} ×${n}`).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {open.length > 0 && <Button onClick={() => act(r, "dismiss")}>{t("Мэдэгдлийг хаах", "Dismiss")}</Button>}
                    {r.visibility === "visible" ? (
                      <Button variant="danger" icon={EyeOff} onClick={() => setConfirm(r)}>
                        {t("Нуух", "Hide")}
                      </Button>
                    ) : (
                      <Button icon={Eye} onClick={() => act(r, "restore")}>
                        {t("Сэргээх", "Restore")}
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={!!confirm}
        title={confirm ? t(`${confirm.ref}-ийг нуух уу?`, `Hide ${confirm.ref}?`) : ""}
        onClose={() => setConfirm(null)}
        actions={
          <>
            <Button data-autofocus icon={X} onClick={() => setConfirm(null)}>
              {t("Болих", "Cancel")}
            </Button>
            <Button
              variant="danger"
              icon={EyeOff}
              onClick={() => {
                if (confirm) act(confirm, "hide");
                setConfirm(null);
              }}
            >
              {t("Нуух", "Hide report")}
            </Button>
          </>
        }
      >
        {t("Газрын зураг болон олон нийтийн хуудаснаас алга болно. Дараа нь сэргээж болно.", "It disappears from the map and public pages. You can restore it later.")}
      </Dialog>
    </div>
  );
}
