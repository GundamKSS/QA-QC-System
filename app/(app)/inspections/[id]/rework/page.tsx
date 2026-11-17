import { AppBack } from "@/components/ui/AppBack";
import { Suspense } from "react";
import { ReworkRunnerView } from "@/components/inspections/ReworkRunnerView";
import { requirePageAccess } from "@/lib/auth/dal";
import { getInspectionStore } from "@/lib/inspections/runtime";

export const metadata = { title: "ตัวตรวจ Rework (Screen S08)" };

/**
 * Screen S08: Rework Runner Page.
 * Loads failed items from previous inspection round and renders the Rework Runner.
 * Wrapped in <Suspense> for Next.js Partial Prerendering (PPR) instant shell navigation.
 */
export default function ReworkRunnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<ReworkSkeleton />}>
      <ReworkRunnerContent params={params} />
    </Suspense>
  );
}

async function ReworkRunnerContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageAccess("scan", "/scan");
  const { id } = await params;

  let details = null;
  try {
    const store = getInspectionStore();
    details = await store.getReworkDetails(id);
  } catch (err) {
    console.error("Failed to load rework details for ID", id, err);
    details = null;
  }

  if (!details) {
    return (
      <div className="min-w-0 w-full max-w-xl mx-auto p-4 sm:p-6 space-y-4 text-center">
        <div className="rounded-panel border border-fail/40 bg-carbon-800 p-8 space-y-3">
          <h1 className="text-lg font-bold text-ti-50">ไม่พบรายการที่ต้อง Rework</h1>
          <p className="text-sm text-ti-400">
            รายการตรวจนี้อาจได้รับการแก้ไขแล้ว หรือไม่ได้อยู่ในสถานะส่งซ่อม
          </p>
          <div className="pt-2 flex justify-center">
            <AppBack href="/jobs">กลับไปที่งานของฉัน</AppBack>
          </div>
        </div>
      </div>
    );
  }

  return <ReworkRunnerView details={details} />;
}

function ReworkSkeleton() {
  return (
    <div
      className="min-w-0 w-full max-w-xl mx-auto p-3 sm:p-5 space-y-4"
      role="status"
      aria-label="กำลังโหลดหน้าตัวตรวจ Rework"
      aria-busy="true"
    >
      <div className="rounded-3xl border border-carbon-700 bg-carbon-800 p-6 space-y-4 animate-pulse">
        <div className="h-3 w-32 bg-carbon-700 rounded-full mx-auto" />
        <div className="h-8 w-48 bg-carbon-700 rounded-xl mx-auto" />
        <div className="h-3 w-28 bg-carbon-700 rounded-full mx-auto" />
        <div className="h-36 w-full bg-carbon-900/60 rounded-2xl" />
        <div className="h-24 w-full bg-carbon-900/40 rounded-2xl" />
      </div>
    </div>
  );
}
