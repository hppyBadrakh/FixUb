import { Suspense } from "react";
import { ConsoleShell } from "@/components/shell";
import { PageSkeleton } from "@/components/ui/feedback";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ConsoleShell area="staff">{children}</ConsoleShell>
    </Suspense>
  );
}
