import type { Metadata } from "next";
import { StaffQueue } from "@/components/pages/staff-queue";

export const metadata: Metadata = { title: "Ажлын дараалал / Work queue" };

export default function Page() {
  return <StaffQueue />;
}
