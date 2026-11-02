"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Bi, Lang } from "./types";

interface LangValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Inline bilingual string: t("Мэдээлэх", "Report"). */
  t: (mn: string, en: string) => string;
  pick: (bi: Bi | undefined) => string;
}

const LangContext = createContext<LangValue | null>(null);
const KEY = "fixub-lang";

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("mn");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the saved choice after hydration
      if (saved === "en" || saved === "mn") setLangState(saved);
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(KEY, l);
    } catch {}
  }, []);

  const value = useMemo<LangValue>(
    () => ({
      lang,
      setLang,
      t: (mn, en) => (lang === "mn" ? mn : en),
      pick: (bi) => (bi ? bi[lang] : ""),
    }),
    [lang, setLang],
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useT(): LangValue {
  const v = useContext(LangContext);
  if (!v) throw new Error("useT must be used inside LangProvider");
  return v;
}
