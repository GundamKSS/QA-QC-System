import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requirePageAccess } from "@/lib/auth/dal";
import { InspectionReportView } from "@/components/reports/InspectionReportView";

export const metadata = {
  title: "รายงานผลการตรวจคุณภาพ (Inspection Report) | QA & QC System",
  description: "ใบรับรองและรายงานผลการตรวจสอบคุณภาพระดับล็อต (Screen S15 / docs/02 FR-RPT-01..08)",
};

export default function PlanReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<p className="p-6 text-ti-400">กำลังโหลด…</p>}>
      <PlanReportContent params={params} />
    </Suspense>
  );
}

async function PlanReportContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^\d{1,12}$/.test(id)) notFound();
  const user = await requirePageAccess("reports", `/plans/${id}/report`);
  const canViewPlan = user.roles.some((r) => ["QC_HEAD", "QA_HEAD", "ADMIN"].includes(r));

  return <InspectionReportView planId={Number(id)} canViewPlan={canViewPlan} />;
}
