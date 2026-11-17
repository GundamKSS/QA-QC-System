import { notFound } from "next/navigation";
import { Suspense } from "react";
import { WorkOrderFormView } from "@/components/plans/WorkOrderFormView";
import { requirePageAccess } from "@/lib/auth/dal";

export const metadata = { title: "เปิดใบงาน" };

export default function NewWorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="p-6 text-ti-400">กำลังโหลด…</p>}>
      <NewWorkOrder params={params} />
    </Suspense>
  );
}

/** Checks the role and the plan id; the plan, the inspectors and the taken dates are read from `GET /api/plans/[id]/work-orders` (components/plans). */
async function NewWorkOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,12}$/.test(id)) notFound();
  await requirePageAccess("work-order", `/plans/${id}/work-orders/new`);
  return <WorkOrderFormView planId={Number(id)} />;
}
