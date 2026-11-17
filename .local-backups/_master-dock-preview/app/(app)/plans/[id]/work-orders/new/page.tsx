import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requirePageAccess } from "@/lib/auth/dal";
import { dbProblem, dbProblemMessages, isDbError } from "@/lib/db/errors";
import { canOpenWorkOrder, takesCallInDate, thaiToday } from "@/lib/plans/rules";
import { getPlanStore } from "@/lib/plans/runtime";
import type { Inspector, PlanDetail } from "@/lib/plans/store";
import { WorkOrderForm } from "./WorkOrderForm";

export const metadata = { title: "เปิดใบงาน" };

export default function NewWorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="p-6 text-ti-400">กำลังโหลด…</p>}>
      <NewWorkOrder params={params} />
    </Suspense>
  );
}

async function NewWorkOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,12}$/.test(id)) notFound();
  await requirePageAccess("work-order", `/plans/${id}/work-orders/new`);

  let data: { plan: PlanDetail | null; nextSeq: number; takenDates: { date: string; woNo: string }[]; inspectors: Inspector[] };
  try {
    const store = getPlanStore();
    const plan = await store.getPlan(Number(id));
    const workOrders = plan ? await store.workOrdersOf(plan.id) : [];
    data = {
      plan,
      nextSeq: Math.max(0, ...workOrders.map((wo) => wo.seq)) + 1,
      takenDates: workOrders.filter((wo) => takesCallInDate(wo.status)).map((wo) => ({ date: wo.calledDate, woNo: wo.woNo })),
      inspectors: plan ? await store.listInspectors() : [],
    };
  } catch (error) {
    if (!isDbError(error)) throw error;
    console.error("[db] new work order page failed", error.message);
    return (
      <Shell planId={Number(id)}>
        <p role="alert" className="rounded-control border border-red-500/50 bg-carbon-800 px-3 py-2 text-sm text-red-300">{dbProblemMessages[dbProblem(error)]}</p>
      </Shell>
    );
  }
  const { plan } = data;
  if (!plan) notFound();
  const remaining = plan.lotQty - plan.lotCalledTotal;

  return (
    <Shell planId={plan.id} plan={plan}>
      {!canOpenWorkOrder(plan.status) || remaining <= 0 ? (
        <p role="alert" className="rounded-control border border-ember-500/50 bg-carbon-800 px-3 py-2 text-sm text-ember-400">
          {remaining <= 0 ? "ล็อตนี้เรียกเข้าครบแล้ว — เปิดใบงานเพิ่มไม่ได้" : "แผนนี้เสร็จ ยกเลิก หรือถูกพักล็อตแล้ว — เปิดใบงานไม่ได้"}
        </p>
      ) : (
        <WorkOrderForm
          plan={{ id: plan.id, planNo: plan.planNo, lotQty: plan.lotQty, lotCalledTotal: plan.lotCalledTotal, qcRequired: plan.qcRequired, qcDoneTotal: plan.qcDoneTotal, qcPercent: plan.qcPercent }}
          nextSeq={data.nextSeq}
          takenDates={data.takenDates}
          inspectors={data.inspectors}
          today={thaiToday(new Date())}
        />
      )}
    </Shell>
  );
}

function Shell({ planId, plan, children }: { planId: number; plan?: PlanDetail; children: React.ReactNode }) {
  return (
    <div className="min-w-0 w-full space-y-5 p-4 sm:p-6">
      <Link href={`/plans/${planId}?tab=work`} className="text-sm text-ti-400 hover:text-ti-200">← {plan ? plan.planNo : "แผน"}</Link>
      <header className="space-y-1">
        <h1 className="text-2xl text-ti-50">เปิดใบงาน</h1>
        {plan && (
          <p className="text-sm text-ti-400">
            {plan.model.code} · {plan.doc.docType === "PO" ? `PO ${plan.doc.docNo}` : plan.doc.docNo} · {plan.doc.vendorName} — 1 ใบงาน = การเรียกของเข้า 1 ครั้ง
          </p>
        )}
      </header>
      {children}
    </div>
  );
}
