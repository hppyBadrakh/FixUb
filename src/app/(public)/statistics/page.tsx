import type { Metadata } from "next";
import { Statistics } from "@/components/pages/statistics";

export const metadata: Metadata = { title: "Статистик / Statistics" };

export default function Page() {
  return <Statistics />;
}
