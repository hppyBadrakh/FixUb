import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/feedback";
import { ReportDetail } from "@/components/pages/report-detail";

export default function ReportPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReportDetail />
    </Suspense>
  );
}
