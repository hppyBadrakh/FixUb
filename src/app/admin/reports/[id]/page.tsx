import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/feedback";
import { ConsoleReport } from "@/components/pages/console-report";

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ConsoleReport area="admin" />
    </Suspense>
  );
}
