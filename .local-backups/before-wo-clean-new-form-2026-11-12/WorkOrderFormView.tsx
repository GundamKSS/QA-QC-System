"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { LoadError } from "@/components/feedback/LoadError";
import { useWorkOrderForm } from "./useWorkOrderForm";
import { WorkOrderForm } from "./WorkOrderForm";

const BLOCKED = {
  lot_full: "ล็อตนี้เรียกเข้าครบแล้ว — เปิดใบงานเพิ่มไม่ได้",
  plan_closed: "แผนนี้เสร็จ ยกเลิก หรือถูกพักล็อตแล้ว — เปิดใบงานไม่ได้",
} as const;

/**
 * เปิดใบงาน (docs/16 §4): the header and the form. The page checks the role and the plan id; the plan's lot
 * figures, the next number, the taken dates and the inspectors are read from `GET /api/plans/[id]/work-orders`.
 * The form is keyed by the plan and stays put when the data loads again, so a refusal that says "this
 * inspector is gone" refreshes the list under what was typed instead of wiping it.
 */
export function WorkOrderFormView({ planId }: { planId: number }) {
  const { data, loading, error, reload } = useWorkOrderForm(planId);
  const plan = data?.plan;

  return (
    <div className="min-w-0 w-full space-y-5 p-4 sm:p-6">
      <Link href={`/plans/${planId}?tab=work`} className="text-sm text-ti-400 hover:text-ti-200">← {plan ? plan.planNo : "แผน"}</Link>
      <header className="space-y-1">
        <h1 className="text-2xl text-ti-50">เปิดใบงาน</h1>
        {plan && (
          <p className="text-sm text-ti-400 break-words">
            {plan.modelCode} · {plan.docType === "PO" ? `PO ${plan.docNo}` : plan.docNo} · {plan.vendorName} — 1 ใบงาน = การเรียกของเข้า 1 ครั้ง
          </p>
        )}
      </header>
      {error && <LoadError message={error} onRetry={reload} />}
      {data === null ? (
        !error && <Placeholder />
      ) : data.blocked ? (
        <Alert>{BLOCKED[data.blocked]}</Alert>
      ) : (
        <div aria-busy={loading} className={`transition-opacity ${loading ? "opacity-60" : ""}`}>
          <WorkOrderForm key={data.plan.id} plan={data.plan} nextSeq={data.nextSeq} inspectors={data.inspectors} today={data.today} />
        </div>
      )}
    </div>
  );
}

function Alert({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-control border border-ember-500/50 bg-carbon-800 px-3 py-2 text-sm text-ember-400">{children}</p>;
}

function Placeholder() {
  return <div role="status" aria-label="กำลังโหลดฟอร์ม" className="app-panel h-72 animate-pulse rounded-panel border border-carbon-700 bg-carbon-800" />;
}
