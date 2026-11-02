import { AppHeader, MobileTabBar } from "@/components/shell";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      <main id="main">{children}</main>
      <MobileTabBar />
    </>
  );
}
