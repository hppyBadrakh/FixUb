import type { Metadata } from "next";
import { AdminCategories } from "@/components/pages/admin-categories";

export const metadata: Metadata = { title: "Ангилал / Categories" };

export default function Page() {
  return <AdminCategories />;
}
