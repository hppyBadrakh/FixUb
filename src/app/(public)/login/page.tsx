import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/feedback";
import { LoginPage } from "@/components/pages/login";

export const metadata: Metadata = { title: "Нэвтрэх / Sign in" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LoginPage />
    </Suspense>
  );
}
