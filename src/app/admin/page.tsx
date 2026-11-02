import type { Metadata } from "next";
import { AdminOverview } from "@/components/pages/admin-overview";

export const metadata: Metadata = { title: "Админ / Admin" };

export default function Page() {
  return <AdminOverview />;
}
