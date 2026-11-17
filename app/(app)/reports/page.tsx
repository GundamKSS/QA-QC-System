import { Suspense } from "react";
import { requirePageAccess } from "@/lib/auth/dal";
import { ReportsListView } from "@/components/reports/ReportsListView";

export const metadata = {
  title: "รายงานผลการตรวจสอบคุณภาพทั้งหมด | QA & QC System",
  description: "ศูนย์รวมรายงานผลการตรวจรับรองคุณภาพ QC/QA และ Export PDF (Screen S15 / docs/02 FR-RPT-08)",
};

export default function ReportsPage() {
  return (
    <Suspense fallback={<p className="p-6 text-ti-400">กำลังโหลด…</p>}>
      <ReportsContent />
    </Suspense>
  );
}

async function ReportsContent() {
  await requirePageAccess("reports", "/reports");
  return <ReportsListView />;
}
