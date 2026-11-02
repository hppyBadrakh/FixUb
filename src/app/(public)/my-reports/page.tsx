import type { Metadata } from "next";
import { MyReports } from "@/components/pages/my-reports";

export const metadata: Metadata = { title: "Миний мэдээлэл / My reports" };

export default function Page() {
  return <MyReports />;
}
