"use client";

import { AppBack } from "@/components/ui/AppBack";
import Link from "next/link";
import type { ReactNode } from "react";
import { LoadError } from "@/components/feedback/LoadError";
import type { OpenPlanPrefill } from "@/lib/plans/open-query";
import { OpenPlanForm } from "./OpenPlanForm";
import { useOpenPlanData } from "./useOpenPlanData";

type Props = {
  /** `?opened=<id>`: the plan that was just saved, already parsed by the page. */
  openedId: number | null;
  /** The document to start from (`?docType=&vendorId=&docNo=`, "open the next model in this Invoice"). */
  prefill: OpenPlanPrefill;
  /** Whether the address named the document type; when it didn't, the form starts from the type of the plan just opened. */
  hasDocType: boolean;
};

/**
 * เปิดแผนตรวจ (docs/14): the header, the "opened" banner and the form. The page checks the role and parses the
 * address; the vendors, models and QC settings come from `GET /api/plans/options`. The form is drawn from the data on
 * screen and keyed by what it was drawn for, so after a save it starts clean once the new data is in (the old
 * form stays, dimmed, until then) and a reload of the same data doesn't wipe what is being typed.
 */
export function OpenPlanView({ openedId, prefill, hasDocType }: Props) {
  const { data, loading, error, reload } = useOpenPlanData(openedId);

  if (!data) {
    return <Shell>{error ? <LoadError message={error} onRetry={reload} /> : <div role="status" aria-label="กำลังโหลดฟอร์ม" className="app-panel h-72 animate-pulse rounded-panel border border-carbon-700 bg-carbon-800" />}</Shell>;
  }

  const { opened, options } = data;
  // After a save, start the next plan from the same source (Invoice / PO) the user just used.
  const start = opened && !hasDocType ? { ...prefill, docType: opened.docType } : prefill;
  const next = opened ? new URLSearchParams({ docType: opened.docType, ...(opened.vendorId !== null ? { vendorId: String(opened.vendorId) } : {}), docNo: opened.docNo }) : null;

  return (
    <Shell>
      {error && <LoadError message={error} onRetry={reload} />}
      {opened && next && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-panel border border-pass/40 bg-carbon-800 px-4 py-3 text-sm">
          <p className="min-w-0 flex-1 text-ti-200">
            เปิดแผน <span className="whitespace-nowrap font-mono font-semibold text-pass">{opened.planNo}</span> แล้ว — {opened.modelCode} · QC ต้องตรวจ {opened.qcRequired} จาก {opened.lotQty.toLocaleString("th-TH")} เครื่อง
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/plans/${opened.id}`} className="inline-flex h-10 items-center rounded-control border border-ti-600 px-3 text-sm text-ti-200 hover:border-ti-400">
              ดูแผน
            </Link>
            <Link href={`/plans/new?${next}`} className="inline-flex h-10 items-center rounded-control border border-ember-500/70 px-3 text-sm text-ember-400 hover:bg-ember-500/10">
              เปิด Model ถัดไปใน{opened.docType === "INVOICE" ? " Invoice" : " PO"} นี้
            </Link>
          </div>
        </div>
      )}
      {options.vendors.length === 0 || options.models.length === 0 ? (
        <p role="alert" className="rounded-control border border-ember-500/50 bg-carbon-800 px-3 py-2 text-sm text-ember-400">
          {options.vendors.length === 0 && "ยังไม่มี Vendor จาก Demand Planning — รอฝ่าย Demand ลงแผนก่อนจึงเปิดแผนได้ "}
          {options.models.length === 0 && "ยังไม่มี Model ที่ใช้งานอยู่ — เพิ่มที่หน้าข้อมูลหลักก่อนเปิดแผน"}
        </p>
      ) : (
        <div aria-busy={loading} className={`transition-opacity ${loading ? "opacity-60" : ""}`}>
          {/* Re-keyed after a save so "เปิด Model ถัดไป" starts from a clean form; keyed by the data, not the address, so it flips once, when the new data is here. */}
          <OpenPlanForm key={`${opened?.id ?? "new"}-${start.docType}-${start.vendorId}-${start.docNo}`} options={options} settings={data.settings} today={data.today} prefill={start} />
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0 w-full space-y-5 p-4 sm:p-6">
      <AppBack href="/plans">กลับไปรายการแผน</AppBack>
      <header className="space-y-1">
        <h1 className="text-2xl text-ti-50">เปิดแผนตรวจ</h1>
        <p className="text-sm text-ti-400">1 แผน = 1 Invoice/PO × 1 Model — เลขที่แผนออกอัตโนมัติเมื่อบันทึก</p>
      </header>
      {children}
    </div>
  );
}
