"use client";

// The admin's Users page: who has signed in, and what each person may do. Like the categories
// editor it has its own data (useApi) instead of the store's, and saves with server actions.
import { useDeferredValue, useState } from "react";
import { Ban, Save, ShieldCheck, Trash2, Undo2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Banner, EmptyState, PageSkeleton, useToast } from "@/components/ui/feedback";
import { SearchField, Select } from "@/components/ui/form";
import { Dialog } from "@/components/ui/overlay";
import { useApi } from "@/lib/api/hooks";
import type { Account, AccountsResponse } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { ROLE_LABEL } from "@/lib/meta";
import { useStore } from "@/lib/store";
import type { Organization, Role } from "@/lib/types";
import { deleteUser, setUserAccess, setUserBanned } from "@/server/actions/users";

interface Draft {
  role: Role;
  organizationId: string;
  unitId: string;
}

const draftOf = (a: Account): Draft => ({ role: a.role, organizationId: a.organizationId ?? "", unitId: a.unitId ?? "" });
const isStaffRole = (role: Role) => role === "org_staff" || role === "org_manager";

export function AdminUsers() {
  const { ready, state, user, refresh } = useStore();
  const { t } = useT();
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query.trim());
  const { data, error, mutate } = useApi<AccountsResponse>(`/api/v1/admin/accounts${q ? `?q=${encodeURIComponent(q)}` : ""}`, { keepPreviousData: true });

  if (!ready || (!data && !error)) return <PageSkeleton />;

  // After a change: this list, and everything the store shows that depends on roles.
  const changed = async () => {
    await Promise.all([mutate(), refresh()]);
  };

  return (
    <div className="mx-auto max-w-[1080px] space-y-5 px-4 py-6 md:px-6 lg:px-8">
      <div>
        <h1 className="text-title-1 font-[650] tracking-tight">{t("Хэрэглэгчид", "Users")}</h1>
        <p className="max-w-[72ch] text-small text-ink-muted">
          {t(
            "Нэвтэрсэн хүн бүр энд гарч ирнэ. Байгууллагын ажилтан эхлээд Google-ээр нэг удаа нэвтэрсний дараа та эрхийг нь эндээс олгоно.",
            "Everyone who has signed in appears here. A staff member signs in with Google once, and then you give them their access here.",
          )}
        </p>
      </div>

      <SearchField label={t("Нэр эсвэл имэйлээр хайх", "Search by name or email")} value={query} onChange={setQuery} onClear={() => setQuery("")} />

      {error ? (
        <Banner tone="danger" title={t("Жагсаалтыг ачаалж чадсангүй", "Couldn't load the list")} actions={<Button onClick={() => mutate()}>{t("Дахин оролдох", "Try again")}</Button>}>
          {error.message}
        </Banner>
      ) : data!.accounts.length === 0 ? (
        <EmptyState icon={UserRound} title={t("Хэрэглэгч олдсонгүй", "No users found")} />
      ) : (
        <>
          <ul className="space-y-3">
            {data!.accounts.map((a) => (
              // Re-created when the saved values change, so the form starts from what is saved.
              <AccountRow key={`${a.id}:${a.role}:${a.organizationId}:${a.unitId}:${a.banned}`} account={a} organizations={state.organizations} isMe={a.id === user?.id} onChanged={changed} />
            ))}
          </ul>
          {data!.total > data!.accounts.length && (
            <p className="text-small text-ink-muted">
              {t(`${data!.total}-аас эхний ${data!.accounts.length}-ийг харуулж байна. Хайлтаар нарийсгана уу.`, `Showing the first ${data!.accounts.length} of ${data!.total}. Search to narrow it down.`)}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function AccountRow({ account, organizations, isMe, onChanged }: { account: Account; organizations: Organization[]; isMe: boolean; onChanged: () => Promise<void> }) {
  const { lang, t, pick } = useT();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => draftOf(account));
  const [busy, setBusy] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saved = draftOf(account);
  const staff = isStaffRole(draft.role);
  const org = organizations.find((o) => o.id === draft.organizationId);
  const dirty = draft.role !== saved.role || (staff && (draft.organizationId !== saved.organizationId || draft.unitId !== saved.unitId));
  const locked = isMe || account.fixedAdmin;

  const failed = (message: string) => toast({ tone: "danger", title: t("Хадгалж чадсангүй", "Couldn't save"), body: message });

  const save = async () => {
    setBusy(true);
    const res = await setUserAccess({
      userId: account.id,
      access: staff
        ? { kind: "staff", organizationId: draft.organizationId, role: draft.role, unitId: draft.unitId || null }
        : { kind: draft.role === "admin" ? "admin" : "citizen" },
    });
    if (!res.ok) failed(res.message);
    else {
      toast({ tone: "success", title: t("Эрхийг шинэчиллээ", "Access updated"), body: `${account.name}: ${pick(ROLE_LABEL[draft.role])}` });
      await onChanged();
    }
    setBusy(false);
  };

  const setBanned = async (banned: boolean) => {
    setBusy(true);
    setConfirmBlock(false);
    const res = await setUserBanned({ userId: account.id, banned });
    if (!res.ok) failed(res.message);
    else {
      toast({ tone: "success", title: banned ? t("Хэрэглэгчийг хаалаа", "Account blocked") : t("Хэрэглэгчийг нээлээ", "Account unblocked"), body: account.name });
      await onChanged();
    }
    setBusy(false);
  };

  const remove = async () => {
    setBusy(true);
    setConfirmDelete(false);
    const res = await deleteUser({ userId: account.id });
    if (!res.ok) failed(res.message);
    else {
      toast({ tone: "success", title: t("Бүртгэлийг устгалаа", "Account deleted"), body: account.name });
      await onChanged();
    }
    setBusy(false);
  };

  return (
    <li className="rounded-md border border-line bg-surface p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-label font-[600]">
            <span className="truncate">{account.name}</span>
            {isMe && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-caption font-[650] text-brand">{t("Та", "You")}</span>}
            {account.banned && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-caption font-[650] text-danger">{t("Хаагдсан", "Blocked")}</span>}
          </p>
          <p className="truncate text-small text-ink-muted">{account.email}</p>
        </div>
        <p className="text-caption text-ink-subtle">
          {t("Бүртгүүлсэн", "Joined")} {formatDate(account.createdAt, lang)}
        </p>
      </div>

      {locked ? (
        <p className="mt-3 flex items-center gap-2 text-small text-ink-muted">
          <ShieldCheck aria-hidden className="size-4" />
          {pick(ROLE_LABEL[account.role])} ·{" "}
          {isMe
            ? t("өөрийн эрхийг өөрчлөх боломжгүй; өөр админаас хүснэ үү.", "you can't change your own access; ask another admin.")
            : t("серверийн тохиргоогоор (ADMIN_EMAILS) админ.", "an admin through the server's settings (ADMIN_EMAILS).")}
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Select
            className="w-full sm:w-52"
            size="sm"
            label={t("Эрх", "Access")}
            value={draft.role}
            onChange={(v) => setDraft((d) => ({ ...d, role: v as Role }))}
            options={(["citizen", "org_staff", "org_manager", "admin"] as const).map((r) => ({ value: r, label: pick(ROLE_LABEL[r]) }))}
          />
          {staff && (
            <>
              <Select
                className="w-full sm:w-60"
                size="sm"
                label={t("Байгууллага", "Organization")}
                value={draft.organizationId}
                onChange={(v) => setDraft((d) => ({ ...d, organizationId: v, unitId: "" }))}
                options={[{ value: "", label: t("Сонгох", "Choose") }, ...organizations.map((o) => ({ value: o.id, label: pick(o.name) }))]}
              />
              <Select
                className="w-full sm:w-52"
                size="sm"
                label={t("Баг", "Unit")}
                value={draft.unitId}
                onChange={(v) => setDraft((d) => ({ ...d, unitId: v }))}
                options={[{ value: "", label: t("Баггүй", "No unit") }, ...(org?.units ?? []).map((u) => ({ value: u.id, label: pick(u.name) }))]}
              />
            </>
          )}
          <Button variant="primary" size="sm" icon={Save} loading={busy} disabled={!dirty || (staff && !draft.organizationId)} onClick={save}>
            {t("Хадгалах", "Save")}
          </Button>
          <span className="sm:ml-auto">
            {account.banned ? (
              <Button size="sm" icon={Undo2} disabled={busy} onClick={() => setBanned(false)}>
                {t("Нээх", "Unblock")}
              </Button>
            ) : (
              <Button size="sm" variant="quiet" icon={Ban} className="text-danger" disabled={busy} onClick={() => setConfirmBlock(true)}>
                {t("Хаах", "Block")}
              </Button>
            )}
            <Button size="sm" variant="quiet" icon={Trash2} className="text-danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
              {t("Устгах", "Delete")}
            </Button>
          </span>
        </div>
      )}

      <Dialog
        open={confirmBlock}
        title={t(`${account.name}-г хаах уу?`, `Block ${account.name}?`)}
        onClose={() => setConfirmBlock(false)}
        actions={
          <>
            <Button data-autofocus onClick={() => setConfirmBlock(false)}>
              {t("Болих", "Cancel")}
            </Button>
            <Button variant="danger" icon={Ban} onClick={() => setBanned(true)}>
              {t("Хаах", "Block account")}
            </Button>
          </>
        }
      >
        {t(
          "Энэ хүн бүх төхөөрөмжөөс гарч, дахин нэвтэрч чадахгүй болно. Мэдээллүүд нь хэвээр үлдэнэ. Дараа нь нээж болно.",
          "They are signed out everywhere and can't sign in again. Their reports stay. You can unblock them later.",
        )}
      </Dialog>

      <Dialog
        open={confirmDelete}
        title={t(`${account.name}-н бүртгэлийг устгах уу?`, `Delete ${account.name}'s account?`)}
        onClose={() => setConfirmDelete(false)}
        actions={
          <>
            <Button data-autofocus onClick={() => setConfirmDelete(false)}>
              {t("Болих", "Cancel")}
            </Button>
            <Button variant="danger" icon={Trash2} onClick={remove}>
              {t("Бүрмөсөн устгах", "Delete for good")}
            </Button>
          </>
        }
      >
        {t(
          "Тухайн хүн өөрөө хүссэн үед хийнэ. Нэр, имэйл, нэвтрэлт, эрх, “Надад ч бас”, хариултууд устана. Илгээсэн мэдээллүүд нь нийтэд үлдэх боловч хэнтэй ч холбогдохгүй. Буцаах боломжгүй.",
          "Do this when the person asks for it. Their name, email, sign-in, access, “me too” and answers are removed. The reports they filed stay public but are linked to nobody. This can't be undone.",
        )}
      </Dialog>
    </li>
  );
}
