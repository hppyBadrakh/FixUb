"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  ClipboardList,
  Building2,
  Flag,
  Globe,
  LayoutDashboard,
  List,
  LogIn,
  LogOut,
  Map as MapIcon,
  Menu,
  Moon,
  Plus,
  Sun,
  User as UserIcon,
  Inbox,
  RotateCcw,
  Tags,
  type LucideIcon,
} from "lucide-react";
import { Button, ButtonLink, IconButton } from "@/components/ui/button";
import { Sheet } from "@/components/ui/overlay";
import { Wordmark } from "@/components/fixub/status";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import { ROLE_LABEL } from "@/lib/meta";
import { useStore } from "@/lib/store";
import { OPEN_STATUSES } from "@/lib/meta";
import type { Role } from "@/lib/types";

export function LangToggle({ className }: { className?: string }) {
  const { lang, setLang } = useT();
  return (
    <div role="group" aria-label="Хэл / Language" className={cn("inline-flex rounded-sm border border-line p-0.5", className)}>
      {(["mn", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          lang={l}
          onClick={() => setLang(l)}
          className={cn(
            "h-8 min-w-9 rounded-[6px] px-2 text-caption font-[650] [@media(pointer:coarse)]:h-10",
            lang === l ? "bg-brand text-on-brand" : "text-ink-muted hover:text-ink",
          )}
        >
          {l === "mn" ? "МН" : "EN"}
        </button>
      ))}
    </div>
  );
}

export function ThemeToggle() {
  const { t } = useT();
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const explicit = el.dataset.theme;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the theme resolved before hydration
    setDark(explicit ? explicit === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try {
      localStorage.setItem("fixub-theme", next ? "dark" : "light");
    } catch {}
  };
  return <IconButton icon={dark ? Sun : Moon} label={dark ? t("Цайвар горим", "Light mode") : t("Бараан горим", "Dark mode")} onClick={toggle} />;
}

function consoleHref(role: Role | undefined) {
  if (role === "admin") return "/admin";
  if (role === "org_staff" || role === "org_manager") return "/staff";
  return null;
}

const publicNav = [
  { href: "/", mn: "Газрын зураг", en: "Map", icon: MapIcon },
  { href: "/statistics", mn: "Статистик", en: "Statistics", icon: BarChart3 },
  { href: "/my-reports", mn: "Миний мэдээлэл", en: "My reports", icon: ClipboardList },
];

export function AppHeader() {
  const pathname = usePathname();
  const { t, pick } = useT();
  const { user, signOut } = useStore();
  const [menu, setMenu] = useState(false);
  const router = useRouter();
  if (pathname === "/reports/new") return null;
  const consoleLink = consoleHref(user?.role);
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-2 px-4 md:h-16 md:px-6">
        <Link href="/" className="mr-2 shrink-0 rounded-sm" aria-label="FixUB — home">
          <Wordmark />
        </Link>
        <nav aria-label={t("Үндсэн цэс", "Main")} className="hidden items-center gap-1 lg:flex">
          {publicNav.map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-sm px-3 py-2 text-label font-[550]",
                  active ? "bg-brand-soft text-brand" : "text-ink-muted hover:text-ink",
                )}
              >
                {t(n.mn, n.en)}
              </Link>
            );
          })}
          {consoleLink && (
            <Link href={consoleLink} className="rounded-sm px-3 py-2 text-label font-[550] text-ink-muted hover:text-ink">
              {t("Удирдлагын хэсэг", "Console")}
            </Link>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="hidden sm:inline-flex">
            <LangToggle />
          </span>
          <span className="hidden sm:inline-flex">
            <ThemeToggle />
          </span>
          {user ? (
            <Link
              href="/login"
              className="hidden items-center gap-1.5 rounded-sm px-2.5 py-2 text-label font-[550] text-ink hover:bg-surface-sunken lg:inline-flex"
              title={t("Дүр солих", "Switch role")}
            >
              <UserIcon aria-hidden className="size-5" strokeWidth={1.75} />
              <span className="max-w-[10rem] truncate">{user.name}</span>
              <span className="text-caption text-ink-subtle">· {pick(ROLE_LABEL[user.role])}</span>
            </Link>
          ) : (
            <span className="hidden lg:inline-flex">
              <ButtonLink href="/login" variant="quiet">
                {t("Нэвтрэх", "Sign in")}
              </ButtonLink>
            </span>
          )}
          <ButtonLink href="/reports/new" variant="primary" icon={Plus} className="px-3 sm:px-4">
            <span className="hidden sm:inline">{t("Асуудал мэдээлэх", "Report a problem")}</span>
            <span className="sm:hidden">{t("Мэдээлэх", "Report")}</span>
          </ButtonLink>
          <span className="inline-flex lg:hidden">
            <IconButton icon={Menu} label={t("Цэс", "Menu")} onClick={() => setMenu(true)} />
          </span>
        </div>
      </div>
      <Sheet open={menu} title={t("Цэс", "Menu")} onClose={() => setMenu(false)}>
        <nav className="flex flex-col gap-1" aria-label={t("Үндсэн цэс", "Main")}>
          {[...publicNav, ...(consoleLink ? [{ href: consoleLink, mn: "Удирдлагын хэсэг", en: "Console", icon: LayoutDashboard }] : [])].map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setMenu(false)}
              className="flex h-12 items-center gap-3 rounded-sm px-3 text-label font-[550] hover:bg-surface-sunken"
            >
              <n.icon aria-hidden className="size-5 text-ink-muted" strokeWidth={1.75} />
              {t(n.mn, n.en)}
            </Link>
          ))}
        </nav>
        <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
          <LangToggle />
          <ThemeToggle />
        </div>
        <div className="mt-4 border-t border-line pt-4">
          {user ? (
            <>
              <p className="text-label font-[600]">{user.name}</p>
              <p className="text-small text-ink-subtle">{pick(ROLE_LABEL[user.role])}</p>
              <div className="mt-3 flex gap-2">
                <ButtonLink href="/login" onClick={() => setMenu(false)}>
                  {t("Дүр солих", "Switch role")}
                </ButtonLink>
                <Button
                  variant="quiet"
                  icon={LogOut}
                  onClick={() => {
                    signOut();
                    setMenu(false);
                    router.push("/");
                  }}
                >
                  {t("Гарах", "Sign out")}
                </Button>
              </div>
            </>
          ) : (
            <ButtonLink href="/login" icon={LogIn} fullWidth onClick={() => setMenu(false)}>
              {t("Нэвтрэх (демо)", "Sign in (demo)")}
            </ButtonLink>
          )}
        </div>
      </Sheet>
    </header>
  );
}

export function MobileTabBar() {
  const pathname = usePathname();
  const { t } = useT();
  if (pathname === "/reports/new") return null;
  const tabs: { href: string; mn: string; en: string; icon: LucideIcon; match: (p: string) => boolean; primary?: boolean }[] = [
    { href: "/", mn: "Зураг", en: "Map", icon: MapIcon, match: (p) => p === "/" },
    { href: "/?view=list", mn: "Жагсаалт", en: "List", icon: List, match: () => false },
    { href: "/reports/new", mn: "Мэдээлэх", en: "Report", icon: Plus, match: () => false, primary: true },
    { href: "/my-reports", mn: "Миний", en: "Mine", icon: UserIcon, match: (p) => p.startsWith("/my-reports") },
    { href: "/statistics", mn: "Статистик", en: "Stats", icon: BarChart3, match: (p) => p.startsWith("/statistics") },
  ];
  return (
    <>
    <div aria-hidden className="h-[calc(64px+env(safe-area-inset-bottom))] md:hidden" />
    <nav
      aria-label={t("Доод цэс", "Tab bar")}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid h-16 grid-cols-5">
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 text-[12px] font-[550]",
                  active ? "text-brand" : "text-ink-muted",
                )}
              >
                {tab.primary ? (
                  <span className="grid h-8 w-11 place-items-center rounded-sm bg-brand text-on-brand">
                    <tab.icon aria-hidden className="size-5" strokeWidth={2} />
                  </span>
                ) : (
                  <tab.icon aria-hidden className="size-5" strokeWidth={1.75} />
                )}
                {t(tab.mn, tab.en)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
    </>
  );
}

/* ---------- Console (admin + staff) ---------- */

export function ConsoleShell({ area, children }: { area: "admin" | "staff"; children: React.ReactNode }) {
  const pathname = usePathname();
  const { t, pick } = useT();
  const { ready, user, state, signOut, reset } = useStore();
  const router = useRouter();
  const [menu, setMenu] = useState(false);

  const allowed =
    !!user && (area === "admin" ? user.role === "admin" : user.role === "org_staff" || user.role === "org_manager");
  const org = state.organizations.find((o) => o.id === user?.organizationId);

  const items: { href: string; mn: string; en: string; icon: LucideIcon; count?: number; exact?: boolean }[] =
    area === "admin"
      ? [
          { href: "/admin", mn: "Тойм", en: "Overview", icon: LayoutDashboard, exact: true },
          {
            href: "/admin/reports",
            mn: "Мэдээллүүд",
            en: "Reports",
            icon: Inbox,
            count: state.reports.filter((r) => !r.organizationId && OPEN_STATUSES.includes(r.status) && r.visibility === "visible").length,
          },
          { href: "/admin/organizations", mn: "Байгууллагууд", en: "Organizations", icon: Building2 },
          { href: "/admin/categories", mn: "Ангилал", en: "Categories", icon: Tags },
          {
            href: "/admin/moderation",
            mn: "Хяналт",
            en: "Moderation",
            icon: Flag,
            count: state.reports.filter((r) => r.flags.some((f) => f.status === "open")).length,
          },
        ]
      : [
          {
            href: "/staff",
            mn: "Ажлын дараалал",
            en: "Work queue",
            icon: Inbox,
            exact: true,
            count: state.reports.filter((r) => r.organizationId === user?.organizationId && OPEN_STATUSES.includes(r.status) && r.visibility === "visible").length,
          },
        ];

  const nav = (
    <nav aria-label={t("Удирдлагын цэс", "Console")} className="flex flex-col gap-0.5">
      <p className="px-3 pb-1 pt-2 text-eyebrow font-[650] uppercase tracking-wide text-ink-subtle">{t("Ажил", "Work")}</p>
      {items.map((n) => {
        const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={() => setMenu(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-10 items-center gap-3 rounded-sm px-3 text-label font-[550] [@media(pointer:coarse)]:h-11",
              active ? "bg-brand-soft text-brand" : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
            )}
          >
            <n.icon aria-hidden className="size-5" strokeWidth={1.75} />
            <span className="flex-1">{t(n.mn, n.en)}</span>
            {!!n.count && <span className="text-caption font-[650] tnum">{n.count}</span>}
          </Link>
        );
      })}
      <p className="px-3 pb-1 pt-4 text-eyebrow font-[650] uppercase tracking-wide text-ink-subtle">{t("Олон нийт", "Public")}</p>
      <Link href="/" onClick={() => setMenu(false)} className="flex h-10 items-center gap-3 rounded-sm px-3 text-label font-[550] text-ink-muted hover:bg-surface-sunken hover:text-ink">
        <Globe aria-hidden className="size-5" strokeWidth={1.75} />
        {t("Олон нийтийн газрын зураг", "Public map")}
      </Link>
    </nav>
  );

  const footer = (
    <div className="space-y-3 border-t border-line pt-4">
      <div className="flex items-center justify-between">
        <LangToggle />
        <ThemeToggle />
      </div>
      {user && (
        <div>
          <p className="truncate text-label font-[600]">{user.name}</p>
          <p className="text-caption text-ink-subtle">{pick(ROLE_LABEL[user.role])}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        <ButtonLink href="/login" size="sm" variant="quiet">
          {t("Дүр солих", "Switch role")}
        </ButtonLink>
        <Button
          size="sm"
          variant="quiet"
          icon={LogOut}
          onClick={() => {
            signOut();
            router.push("/");
          }}
        >
          {t("Гарах", "Sign out")}
        </Button>
      </div>
      {area === "admin" && (
        <Button
          size="sm"
          variant="quiet"
          icon={RotateCcw}
          className="text-ink-muted"
          onClick={async () => {
            if (window.confirm(t("Демо өгөгдлийг анхны байдалд нь оруулах уу? Таны нэмсэн мэдээлэл устна.", "Reset the demo data? Reports you added will be removed."))) await reset();
          }}
        >
          {t("Демог шинэчлэх", "Reset demo data")}
        </Button>
      )}
    </div>
  );

  const header = (
    <div>
      <Link href={area === "admin" ? "/admin" : "/staff"} className="inline-block rounded-sm px-3">
        <Wordmark />
      </Link>
      <p className="mt-2 px-3 text-small text-ink-muted">
        {area === "admin" ? t("FixUB баг", "FixUB team") : org ? pick(org.name) : "—"}
      </p>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-4 overflow-y-auto border-r border-line bg-surface p-3 lg:flex">
        {header}
        <div className="flex-1">{nav}</div>
        {footer}
      </aside>
      <div className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-surface px-4 lg:hidden">
        <Link href={area === "admin" ? "/admin" : "/staff"}>
          <Wordmark />
        </Link>
        <span className="truncate text-small text-ink-muted">
          · {area === "admin" ? t("Админ", "Admin") : org ? pick(org.name) : ""}
        </span>
        <span className="ml-auto inline-flex">
          <IconButton icon={Menu} label={t("Цэс", "Menu")} onClick={() => setMenu(true)} />
        </span>
      </div>
      <Sheet open={menu} title={t("Цэс", "Menu")} onClose={() => setMenu(false)}>
        {nav}
        <div className="mt-4">{footer}</div>
      </Sheet>
      <main id="main" className="min-w-0">
        {!ready ? null : allowed ? (
          children
        ) : (
          <div className="mx-auto max-w-lg px-4 py-16 text-center">
            <p className="text-title-2 font-[600]">
              {area === "admin" ? t("Админаар нэвтэрнэ үү", "Sign in as an admin") : t("Байгууллагын ажилтнаар нэвтэрнэ үү", "Sign in as organization staff")}
            </p>
            <p className="mt-2 text-body text-ink-muted">
              {t(
                "Энэ хэсэг зөвхөн эрх бүхий хэрэглэгчдэд зориулагдсан. Демо дүрээ сонгоно уу.",
                "This area is only for authorized users. Choose a demo role to continue.",
              )}
            </p>
            <ButtonLink href={`/login?next=${encodeURIComponent(pathname)}`} variant="primary" icon={LogIn} className="mt-6">
              {t("Демо дүр сонгох", "Choose a demo role")}
            </ButtonLink>
          </div>
        )}
      </main>
    </div>
  );
}
