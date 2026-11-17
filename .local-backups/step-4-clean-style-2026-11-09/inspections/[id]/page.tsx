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
    <div className="min-w-0 w-full space-y-5 p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Top Navigation & Status */}
      <div className="flex items-center justify-between gap-3 border-b border-carbon-700 pb-4">
        <Link
          href="/jobs"
          className="rounded-control border border-ti-600 bg-carbon-800 px-3 py-1.5 text-xs text-ti-200 hover:border-ti-400 hover:text-ti-100 transition-colors"
        >
          กลับหน้ารวมงาน
        </Link>
        <span className="font-mono text-xs rounded-full border border-ember-500/60 text-ember-400 px-2.5 py-0.5">
          กำลังตรวจ
        </span>
      </div>

      {/* Inspection Header Summary Banner */}
      <header className="rounded-panel border border-carbon-700 bg-carbon-800 p-5 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <span className="font-mono text-xs font-semibold text-ember-400">
              {inspection.workOrderId ? `ใบงาน ${inspection.workOrderId}` : "แผนการตรวจ"}
            </span>
            <h1 className="text-xl sm:text-2xl font-bold font-mono text-ti-50">
              Serial {inspection.serialPump}
            </h1>
            {inspection.serialMotor && (
              <p className="text-xs font-mono text-ti-300">
                มอเตอร์: {inspection.serialMotor}
              </p>
            )}
          </div>
          <div className="text-right text-xs font-mono text-ti-400">
            <div>ลำดับ #{inspection.inspectionNo ?? 1}</div>
            <div>เริ่ม {new Date(inspection.startedAt).toLocaleTimeString("th-TH")}</div>
          </div>
        </div>
      </header>

      {/* Screen S06 Runner placeholder */}
      <section className="rounded-panel border border-dashed border-carbon-600 bg-carbon-800/40 p-8 text-center space-y-2">
        <h2 className="text-base font-medium text-ti-100">
          จองเครื่องสำเร็จ — <span className="font-mono text-ember-400">{inspection.serialPump}</span>
        </h2>
        <p className="text-sm text-ti-400 max-w-md mx-auto">
          พร้อมสำหรับระบบตรวจเช็กลิสต์รายข้อ (Checklist Runner) ในขั้นตอนถัดไป
        </p>
      </section>
    </div>
  );
}
