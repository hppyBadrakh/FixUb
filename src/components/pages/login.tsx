"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Building2, Check, LogIn, RotateCcw, ShieldCheck, User as UserIcon } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Banner, PageSkeleton, useToast } from "@/components/ui/feedback";
import { Dialog } from "@/components/ui/overlay";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import { ROLE_LABEL } from "@/lib/meta";
import { useStore } from "@/lib/store";
import type { User } from "@/lib/types";

function homeFor(u: User) {
  if (u.role === "admin") return "/admin";
  if (u.role === "org_staff" || u.role === "org_manager") return "/staff";
  return "/my-reports";
}

export function LoginPage() {
  const { ready, state, user, server, signIn, signInWithGoogle, signOut, reset } = useStore();
  const { t, pick } = useT();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const next = params.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;

  if (!ready) return <PageSkeleton />;

  const choose = async (u: User) => {
    setBusy(u.id);
    const res = await signIn(u.id);
    setBusy(null);
    if (!res.ok) {
      toast({ tone: "danger", title: t("Нэвтэрч чадсангүй", "Couldn't sign in"), body: res.message });
      return;
    }
    toast({ tone: "success", title: t(`${u.name} нэрээр нэвтэрлээ`, `Signed in as ${u.name}`), body: pick(ROLE_LABEL[u.role]) });
    router.push(safeNext ?? homeFor(u));
  };

  const google = async () => {
    setBusy("google");
    const res = await signInWithGoogle(safeNext ?? "/");
    // On success the browser is already leaving for Google.
    if (!res.ok) {
      setBusy(null);
      toast({ tone: "danger", title: t("Google-ээр нэвтэрч чадсангүй", "Google sign-in failed"), body: res.message });
    }
  };

  // With a server, the role picker needs DEMO_LOGIN=true there. The browser-only demo always has it.
  const showPicker = !server.configured || server.demoLogin;
  // Better Auth sends people back here with ?error=… when Google sign-in fails or is cancelled.
  const oauthError = params.get("error");

  const groups: { title: string; icon: typeof UserIcon; desc: string; users: User[] }[] = [
    {
      title: t("Иргэн", "Citizen"),
      icon: UserIcon,
      desc: t("Асуудал мэдээлэх, явцыг хянах, “Надад ч бас” дарах.", "Report problems, track progress, add “me too”."),
      users: state.users.filter((u) => u.role === "citizen"),
    },
    {
      title: t("FixUB админ", "FixUB admin"),
      icon: ShieldCheck,
      desc: t("Ирсэн мэдээллийг хянаж, байгууллага, багт хуваарилах, хяналт хийх.", "Review incoming reports, assign organizations and units, moderate."),
      users: state.users.filter((u) => u.role === "admin"),
    },
    {
      title: t("Байгууллагын ажилтан", "Organization staff"),
      icon: Building2,
      desc: t("Хуваарилагдсан ажлыг харах, төлөв шинэчлэх, гүйцэтгэлээ мэдээлэх.", "See assigned work, update status, report completion."),
      users: state.users.filter((u) => u.role === "org_staff" || u.role === "org_manager"),
    },
  ];

  return (
    <div className="mx-auto max-w-[880px] px-4 py-8 md:px-6 md:py-12">
      {server.configured ? (
        <>
          <h1 className="text-title-1 font-[650] tracking-tight">{t("Нэвтрэх", "Sign in")}</h1>
          <p className="mt-2 max-w-[62ch] text-body text-ink-muted">
            {t(
              "Google бүртгэлээрээ нэвтэрч асуудал мэдээлэх, явцыг хянах боломжтой.",
              "Sign in with your Google account to report problems and follow their progress.",
            )}
          </p>
          {oauthError && (
            <Banner tone="danger" className="mt-5" title={t("Нэвтэрч чадсангүй", "Sign-in didn't complete")}>
              {t("Дахин оролдоно уу.", "Please try again.")} ({oauthError})
            </Banner>
          )}
          {user && (
            <Banner tone="success" className="mt-5" title={t(`${user.name} нэрээр нэвтэрсэн байна`, `Signed in as ${user.name}`)}>
              {pick(ROLE_LABEL[user.role])}
            </Banner>
          )}
          <div className="mt-5">
            {server.google ? (
              <Button variant="primary" size="lg" icon={LogIn} loading={busy === "google"} onClick={google}>
                {t("Google-ээр нэвтрэх", "Sign in with Google")}
              </Button>
            ) : (
              <Banner tone="warning" title={t("Google нэвтрэлт тохируулагдаагүй", "Google sign-in isn't set up on this server")}>
                {t(
                  "Серверт GOOGLE_CLIENT_ID болон GOOGLE_CLIENT_SECRET тохируулсны дараа ажиллана (.env.example-г үзнэ үү).",
                  "It works once GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set on the server (see .env.example).",
                )}
              </Banner>
            )}
          </div>
          {showPicker && (
            <>
              <h2 className="mt-10 text-title-2 font-[650] tracking-tight">{t("Демо дүр сонгох", "Choose a demo role")}</h2>
              <p className="mt-1 max-w-[62ch] text-small text-ink-muted">
                {t(
                  "Танилцуулгад зориулсан: нэг даралтаар жишээ хэрэглэгчээр нэвтэрнэ. Дүрээ сонгоход харах, хийх зүйлс өөрчлөгдөнө.",
                  "For presentations: one click signs you in as a sample user. Picking a role changes what you can see and do.",
                )}
              </p>
            </>
          )}
        </>
      ) : (
        <>
          <h1 className="text-title-1 font-[650] tracking-tight">{t("Демо дүр сонгох", "Choose a demo role")}</h1>
          <p className="mt-2 max-w-[62ch] text-body text-ink-muted">
            {t(
              "Энэ бол прототип: жинхэнэ нэвтрэлт байхгүй. Бодит системд Google-ээр нэвтэрнэ. Дүрээ сонгоход тухайн хэрэглэгчийн харах, хийх зүйлс өөрчлөгдөнө.",
              "This is a prototype with no real sign-in; the production system uses Google sign-in. Picking a role changes what you can see and do.",
            )}
          </p>
          {server.unreachable && (
            <Banner tone="warning" className="mt-5" title={t("Сервертэй холбогдож чадсангүй", "The server can't be reached")}>
              {t("Одоогоор зөвхөн энэ хөтөч дэх демо өгөгдлөөр ажиллаж байна.", "For now the app is running on the sample data in this browser only.")}
            </Banner>
          )}
          <Banner tone="info" className="mt-5" title={t("Өгөгдөл зөвхөн энэ хөтөчид хадгалагдана", "Data stays in this browser")}>
            {t(
              "Бүх мэдээлэл, зураг таны хөтөчийн localStorage болон IndexedDB-д хадгалагдана. Хоёр таб нээж (иргэн ба админ) ажлын урсгалыг зэрэг харж болно.",
              "Reports and photos are saved in this browser's localStorage and IndexedDB. Open two tabs (citizen and admin) to watch the workflow update live.",
            )}
          </Banner>
        </>
      )}

      <div className={showPicker ? "mt-8 space-y-8" : "hidden"}>
        {groups.map((g) => (
          <section key={g.title} aria-labelledby={`g-${g.title}`}>
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-brand-soft text-brand">
                <g.icon aria-hidden className="size-5" strokeWidth={1.75} />
              </span>
              <div>
                <h2 id={`g-${g.title}`} className="text-title-3 font-[600]">
                  {g.title}
                </h2>
                <p className="text-small text-ink-muted">{g.desc}</p>
              </div>
            </div>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {g.users.map((u) => {
                const org = state.organizations.find((o) => o.id === u.organizationId);
                const unit = org?.units.find((x) => x.id === u.unitId);
                const current = user?.id === u.id;
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => choose(u)}
                      disabled={busy !== null}
                      aria-busy={busy === u.id || undefined}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors duration-[140ms] disabled:cursor-wait disabled:opacity-60",
                        current ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-line-strong",
                      )}
                    >
                      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-sunken text-label font-[650] text-ink-muted">
                        {u.name.split(" ").pop()?.[0]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-label font-[600]">{u.name}</span>
                        <span className="block text-small text-ink-subtle">
                          {pick(ROLE_LABEL[u.role])}
                          {org && ` · ${pick(org.name)}`}
                          {unit && ` · ${pick(unit.name)}`}
                        </span>
                      </span>
                      {current && (
                        <span className="inline-flex items-center gap-1 text-caption font-[650] text-brand">
                          <Check aria-hidden className="size-4" /> {t("Одоогийн", "Current")}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-10 flex flex-wrap gap-2 border-t border-line pt-6">
        <ButtonLink href="/" variant="quiet">
          {t("Нэвтрэлгүй үргэлжлүүлэх", "Continue without signing in")}
        </ButtonLink>
        {user && (
          <Button variant="quiet" onClick={() => signOut()}>
            {t("Гарах", "Sign out")}
          </Button>
        )}
        <Button variant="quiet" icon={RotateCcw} className="ml-auto text-ink-muted" onClick={() => setConfirmReset(true)}>
          {t("Демо өгөгдлийг шинэчлэх", "Reset demo data")}
        </Button>
      </div>

      <Dialog
        open={confirmReset}
        title={t("Демо өгөгдлийг шинэчлэх үү?", "Reset the demo data?")}
        onClose={() => setConfirmReset(false)}
        actions={
          <>
            <Button data-autofocus onClick={() => setConfirmReset(false)}>
              {t("Болих", "Cancel")}
            </Button>
            <Button
              variant="danger"
              icon={RotateCcw}
              onClick={async () => {
                await reset();
                setConfirmReset(false);
                toast({ tone: "success", title: t("Демо өгөгдлийг шинэчиллээ", "Demo data reset") });
              }}
            >
              {t("Шинэчлэх", "Reset data")}
            </Button>
          </>
        }
      >
        {t(
          "Анхны 32 жишээ мэдээлэл сэргэж, таны нэмсэн мэдээлэл, зураг устна. Буцаах боломжгүй.",
          "The original 32 sample reports come back and everything you added, including photos, is removed. This can't be undone.",
        )}
      </Dialog>
    </div>
  );
}
