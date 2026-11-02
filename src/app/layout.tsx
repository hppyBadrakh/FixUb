import type { Metadata, Viewport } from "next";
import { Golos_Text } from "next/font/google";
import { LangProvider } from "@/lib/i18n";
import { FixubProvider } from "@/lib/store";
import { ToastProvider } from "@/components/ui/feedback";
import "./globals.css";

const golos = Golos_Text({
  variable: "--font-golos",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: { default: "FixUB — Хотын асуудлыг хамтдаа шийдье", template: "%s · FixUB" },
  description:
    "Улаанбаатарын дэд бүтцийн асуудлыг мэдээлж, явцыг нь олон нийтэд хянах платформ (демо). Report and track public infrastructure problems in Ulaanbaatar.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#141a23" },
  ],
};

// Applies the saved theme before paint so there is no flash.
const themeScript = `try{var t=localStorage.getItem("fixub-theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="mn" className={`${golos.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full bg-bg text-ink">
        <a
          href="#main"
          className="sr-only z-[70] rounded-sm bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          Үндсэн хэсэг рүү / Skip to content
        </a>
        <LangProvider>
          <FixubProvider>
            <ToastProvider>{children}</ToastProvider>
          </FixubProvider>
        </LangProvider>
      </body>
    </html>
  );
}
