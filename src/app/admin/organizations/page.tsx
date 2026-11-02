import type { Metadata } from "next";
import { AdminOrganizations } from "@/components/pages/admin-pages";

export const metadata: Metadata = { title: "Байгууллагууд / Organizations" };

export default function Page() {
  return <AdminOrganizations />;
}
