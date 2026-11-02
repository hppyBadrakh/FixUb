import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/feedback";
import { HomeExplorer } from "@/components/pages/home";

export default function HomePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <HomeExplorer />
    </Suspense>
  );
}
