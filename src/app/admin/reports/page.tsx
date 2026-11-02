import type { Metadata } from "next";
import { AdminReports } from "@/components/pages/admin-pages";

export const metadata: Metadata = { title: "Мэдээллүүд / Reports" };

export default function Page() {
  return <AdminReports />;
}
