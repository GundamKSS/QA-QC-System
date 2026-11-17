import { Suspense } from "react";
import { ScanView } from "@/components/scan/ScanView";
import { requirePageAccess } from "@/lib/auth/dal";

export const metadata = { title: "สแกนตรวจเครื่อง" };

export default async function ScanPage() {
  await requirePageAccess("scan", "/scan");

  return (
    <Suspense fallback={<p className="p-6 text-ti-400">กำลังโหลด…</p>}>
      <ScanView />
    </Suspense>
  );
}
