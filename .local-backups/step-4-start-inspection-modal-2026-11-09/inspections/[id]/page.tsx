import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageAccess } from "@/lib/auth/dal";
import { getInspectionStore } from "@/lib/inspections/runtime";

export const metadata = { title: "การตรวจรับเครื่อง (Checklist Runner)" };

/**
 * Screen S06: Inspection Runner & Checklist View.
 * Displays the item-by-item runner for a claimed unit inspection.
 */
export default async function InspectionRunnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageAccess("jobs", "/jobs");
  const { id } = await params;

  const store = getInspectionStore();
  const inspection = await store.findInspection(id);

  if (!inspection) {
    notFound();
  }

  return (
    <div className="min-w-0 w-full space-y-6 p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Top Navigation & Status */}
      <div className="flex items-center justify-between gap-3 border-b border-carbon-800 pb-4">
        <Link
          href="/jobs"
          className="rounded-control border border-carbon-700 bg-carbon-800 px-3 py-1.5 text-xs text-ti-300 hover:bg-carbon-700 hover:text-ti-100 transition-colors flex items-center gap-1"
        >
          <span>←</span>
          <span>กลับไปหน้ารวมงาน</span>
        </Link>
        <span className="font-mono text-xs rounded-full border border-amber-500/60 bg-amber-950/40 px-2.5 py-1 text-amber-300">
          ● กำลังตรวจ (In Progress)
        </span>
      </div>

      {/* Inspection Header Summary Banner */}
      <header className="rounded-panel border border-carbon-700 bg-carbon-800/90 p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <span className="font-mono text-xs font-semibold text-ember-400">
              {inspection.workOrderId ? `ใบงาน ${inspection.workOrderId}` : "Inspection Plan"}
            </span>
            <h1 className="text-xl sm:text-2xl font-bold font-mono text-ti-50">
              Serial ปั๊ม: {inspection.serialPump}
            </h1>
            {inspection.serialMotor && (
              <p className="text-xs font-mono text-ti-300">
                Serial มอเตอร์: {inspection.serialMotor}
              </p>
            )}
          </div>
          <div className="text-right text-xs font-mono text-ti-400">
            <div>ลำดับการตรวจที่ #{inspection.inspectionNo ?? 1}</div>
            <div>เริ่มเมื่อ: {new Date(inspection.startedAt).toLocaleTimeString("th-TH")}</div>
          </div>
        </div>
      </header>

      {/* Screen S06 Scaffold Banner */}
      <section className="rounded-panel border border-dashed border-carbon-600 bg-carbon-900/60 p-8 text-center space-y-3">
        <div className="text-3xl">📋</div>
        <h2 className="text-lg font-semibold text-ti-100">
          เชื่อมต่อ Screen S05 และระบบ Claim สำเร็จ!
        </h2>
        <p className="text-sm text-ti-400 max-w-md mx-auto">
          เครื่องหมายเลข <span className="font-mono text-amber-300">{inspection.serialPump}</span> ถูกล็อกให้คุณตรวจเรียบร้อยแล้ว
          (โควตาถูกหักออกจากบ่อกลางตามกฎ BR-18 / Live Claiming Pool)
        </p>
        <div className="pt-2">
          <span className="inline-block rounded-control bg-carbon-800 border border-carbon-700 px-3 py-1.5 text-xs text-ti-400">
            พร้อมสำหรับ Step 5: Checklist Runner & Evidence Capture (S06)
          </span>
        </div>
      </section>
    </div>
  );
}
