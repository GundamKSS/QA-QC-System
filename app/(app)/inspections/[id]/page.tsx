import { Suspense } from "react";
import { InspectionRunnerView } from "@/components/inspections/InspectionRunnerView";
import { requirePageAccess } from "@/lib/auth/dal";
import { getInspectionStore } from "@/lib/inspections/runtime";

export const metadata = { title: "การตรวจรับเครื่อง (Checklist Runner)" };

/**
 * Screen S06: Inspection Runner & Checklist View.
 * Displays the item-by-item runner for a claimed unit inspection.
 * Supports both live database claims and locally queued offline claims.
 * Wrapped in <Suspense> for Next.js Partial Prerendering (PPR) instant shell navigation.
 */
export default function InspectionRunnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<InspectionRunnerSkeleton />}>
      <InspectionRunnerContent params={params} />
    </Suspense>
  );
}

async function InspectionRunnerContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageAccess("scan", "/scan");
  const { id } = await params;

  let inspection = null;
  let template = null;
  try {
    const store = getInspectionStore();
    inspection = await store.findInspection(id);
    if (inspection) {
      template = await store.getTemplate(inspection.planId, inspection.role);
    }
  } catch {
    inspection = null;
    template = null;
  }

  return (
    <InspectionRunnerView
      id={id}
      initialInspection={inspection}
      initialTemplate={template}
    />
  );
}

function InspectionRunnerSkeleton() {
  return (
    <div
      className="min-w-0 w-full max-w-xl mx-auto p-3 sm:p-5 space-y-4"
      role="status"
      aria-label="กำลังโหลดหน้าตรวจเช็คลิสต์"
      aria-busy="true"
    >
      <div className="rounded-3xl border border-carbon-700 bg-carbon-800 p-6 space-y-4 animate-pulse">
        <div className="h-3 w-32 bg-carbon-700 rounded-full mx-auto" />
        <div className="h-8 w-48 bg-carbon-700 rounded-xl mx-auto" />
        <div className="h-3 w-28 bg-carbon-700 rounded-full mx-auto" />
        <div className="h-2 w-full bg-carbon-900 rounded-full" />
        <div className="h-36 w-full bg-carbon-900/60 rounded-2xl" />
        <div className="h-20 w-full bg-carbon-900/40 rounded-2xl" />
      </div>
    </div>
  );
}
