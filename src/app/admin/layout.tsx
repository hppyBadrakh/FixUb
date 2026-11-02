import { Suspense } from "react";
import { ConsoleShell } from "@/components/shell";
import { PageSkeleton } from "@/components/ui/feedback";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ConsoleShell area="admin">{children}</ConsoleShell>
    </Suspense>
  );
}
