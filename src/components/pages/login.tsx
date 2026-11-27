"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Building2, Check, LogIn, ShieldCheck, User as UserIcon } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Banner, PageSkeleton, useToast } from "@/components/ui/feedback";
import { LegalLinks } from "@/components/pages/legal";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import { ROLE_LABEL } from "@/lib/meta";
import { useStore } from "@/lib/store";
import { safeNextPath } from "@/lib/safe-next";
import type { User } from "@/lib/types";

function homeFor(u: User) {
  if (u.role === "admin") return "/admin";
  if (u.role === "org_staff" || u.role === "org_manager") return "/staff";
  return "/my-reports";
}

export function LoginPage() {
  const { ready, state, user, server, signInAsSample, signInWithGoogle, signOut } = useStore();
  const { t, pick } = useT();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const next = params.get("next");
  const safeNext = safeNextPath(next);

  if (!ready) return <PageSkeleton />;

  const choose = async (u: User) => {
    setBusy(u.id);
    const res = await signInAsSample(u.id);
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

  // Better Auth sends people back here with ?error=… when Google sign-in fails or is cancelled.
  const oauthError = params.get("error");

  // Sample users exist only on a demonstration deployment (DEMO_LOGIN=true on the server).
  const { sampleUsers } = server;
  const groups: { title: string; icon: typeof UserIcon; desc: string; users: User[] }[] = [
    {
      title: t("Иргэн", "Citizen"),
      icon: UserIcon,
      desc: t("Асуудал мэдээлэх, явцыг хянах, “Надад ч бас” дарах.", "Report problems, track progress, add “me too”."),
      users: sampleUsers.filter((u) => u.role === "citizen"),
    },
    {
      title: t("FixUB админ", "FixUB admin"),
      icon: ShieldCheck,
      desc: t("Ирсэн мэдээллийг хянаж, байгууллага, багт хуваарилах, хяналт хийх.", "Review incoming reports, assign organizations and units, moderate."),
      users: sampleUsers.filter((u) => u.role === "admin"),
    },
    {
      title: t("Байгууллагын ажилтан", "Organization staff"),
      icon: Building2,
      desc: t("Хуваарилагдсан ажлыг харах, төлөв шинэчлэх, гүйцэтгэлээ мэдээлэх.", "See assigned work, update status, report completion."),
      users: sampleUsers.filter((u) => u.role === "org_staff" || u.role === "org_manager"),
    },
  ];

  return (
    <div className="mx-auto max-w-[880px] px-4 py-8 md:px-6 md:py-12">
      <h1 className="text-title-1 font-[650] tracking-tight">{t("Нэвтрэх", "Sign in")}</h1>
      <p className="mt-2 max-w-[62ch] text-body text-ink-muted">
        {t(
          "Google бүртгэлээрээ нэвтэрч асуудал мэдээлэх, явцыг хянах боломжтой. Таны нэр олон нийтэд хэзээ ч харагдахгүй.",
          "Sign in with your Google account to report problems and follow their progress. Your name is never shown publicly.",
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

      {server.demoLogin && (
        <>
          <h2 className="mt-10 text-title-2 font-[650] tracking-tight">{t("Жишээ хэрэглэгчээр нэвтрэх", "Sign in as a sample user")}</h2>
          <p className="mt-1 max-w-[62ch] text-small text-ink-muted">
            {t(
              "Энэ бол танилцуулгын хувилбар: нэг даралтаар жишээ хэрэглэгчээр нэвтэрнэ. Дүрээ сонгоход харах, хийх зүйлс өөрчлөгдөнө.",
              "This is a demonstration deployment: one click signs you in as a sample user. Picking a role changes what you can see and do.",
            )}
          </p>
          <div className="mt-8 space-y-8">
            {groups.map((g) => (
              <section key={g.title} aria-labelledby={`g-${g.title}`}>
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-brand-soft text-brand">
                    <g.icon aria-hidden className="size-5" strokeWidth={1.75} />
                  </span>
                  <div>
                    <h3 id={`g-${g.title}`} className="text-title-3 font-[600]">
                      {g.title}
                    </h3>
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
        </>
      )}

      <div className="mt-10 flex flex-wrap gap-2 border-t border-line pt-6">
        <ButtonLink href="/" variant="quiet">
          {t("Нэвтрэлгүй үргэлжлүүлэх", "Continue without signing in")}
        </ButtonLink>
        {user && (
          <Button variant="quiet" onClick={() => signOut()}>
            {t("Гарах", "Sign out")}
          </Button>
        )}
      </div>
      <LegalLinks className="mt-4 text-small text-ink-subtle" />
    </div>
  );
}
