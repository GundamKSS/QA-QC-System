import { InspectionRunnerView } from "@/components/inspections/InspectionRunnerView";
import { requirePageAccess } from "@/lib/auth/dal";
import { getInspectionStore } from "@/lib/inspections/runtime";

export const metadata = { title: "การตรวจรับเครื่อง (Checklist Runner)" };

/**
 * Screen S06: Inspection Runner & Checklist View.
 * Displays the item-by-item runner for a claimed unit inspection.
 * Supports both live database claims and locally queued offline claims.
 */
export default async function InspectionRunnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageAccess("jobs", "/jobs");
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
