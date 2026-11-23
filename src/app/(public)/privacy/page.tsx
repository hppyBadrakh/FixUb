import type { Metadata } from "next";
import { PrivacyPage } from "@/components/pages/legal";

export const metadata: Metadata = { title: "Нууцлал / Privacy" };

export default function Page() {
  return <PrivacyPage />;
}
