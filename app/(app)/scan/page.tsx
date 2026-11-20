import { Suspense } from "react";
import { ScanView } from "@/components/scan/ScanView";
import { requirePageAccess } from "@/lib/auth/dal";

export const metadata = { title: "สแกนตรวจเครื่อง" };

export default async function ScanPage() {
  const user = await requirePageAccess("scan", "/scan");
  const hasQa = user.roles.includes("QA_INSPECTOR") || user.roles.includes("QA_HEAD");
  const hasQc = user.roles.includes("QC_INSPECTOR") || user.roles.includes("QC_HEAD");
  const side: "QA" | "QC" | undefined = hasQa && !hasQc ? "QA" : hasQc && !hasQa ? "QC" : undefined;

  return (
    <Suspense fallback={<p className="p-6 text-ti-400">กำลังโหลด…</p>}>
      <ScanView side={side} />
    </Suspense>
  );
}
