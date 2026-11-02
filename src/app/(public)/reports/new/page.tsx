import type { Metadata } from "next";
import { ReportFlow } from "@/components/pages/report-flow";

export const metadata: Metadata = { title: "Асуудал мэдээлэх / Report a problem" };

export default function NewReportPage() {
  return <ReportFlow />;
}
