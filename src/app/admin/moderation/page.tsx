import type { Metadata } from "next";
import { AdminModeration } from "@/components/pages/admin-pages";

export const metadata: Metadata = { title: "Хяналт / Moderation" };

export default function Page() {
  return <AdminModeration />;
}
