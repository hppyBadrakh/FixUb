import type { Metadata } from "next";
import { AdminUsers } from "@/components/pages/admin-users";

export const metadata: Metadata = { title: "Хэрэглэгчид / Users" };

export default function Page() {
  return <AdminUsers />;
}
