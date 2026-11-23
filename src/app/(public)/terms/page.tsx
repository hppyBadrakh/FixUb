import type { Metadata } from "next";
import { TermsPage } from "@/components/pages/legal";

export const metadata: Metadata = { title: "Үйлчилгээний нөхцөл / Terms" };

export default function Page() {
  return <TermsPage />;
}
