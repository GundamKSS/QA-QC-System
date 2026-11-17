import Link from "next/link";
import { Suspense } from "react";
import { requirePageAccess } from "@/lib/auth/dal";
import { dbProblem, dbProblemMessages, isDbError } from "@/lib/db/errors";
import { thaiToday } from "@/lib/plans/rules";
import { getPlanStore } from "@/lib/plans/runtime";
import type { OpenOptions, PlanDetail, QcSettings } from "@/lib/plans/store";
import { OpenPlanForm, type Prefill } from "./OpenPlanForm";

export const metadata = { title: "เปิดแผนตรวจ" };

type SearchParams = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export default function NewPlanPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={<p className="p-6 text-ti-400">กำลังโหลด…</p>}>
      <NewPlan searchParams={searchParams} />
    </Suspense>
  );
}

async function NewPlan({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePageAccess("plan-open", "/plans/new");
  const query = await searchParams;
  const openedId = /^\d{1,12}$/.test(one(query.opened)) ? Number(one(query.opened)) : null;

  // "เปิด Model ถัดไปใน Invoice นี้" (K4) comes back with the document filled in.
  const docType = one(query.docType) === "PO" ? "PO" : "INVOICE";
  const store = getPlanStore();
  const prefill: Prefill = {
    docType,
    vendorId: /^\d{1,9}$/.test(one(query.vendorId)) ? one(query.vendorId) : "",
    docNo: one(query.docNo).slice(0, 64),
  };

  let data: { options: OpenOptions; settings: QcSettings; opened: PlanDetail | null };
  try {
    const now = new Date();
    data = { options: await store.listOpenOptions(), settings: await store.qcSettings(now), opened: openedId ? await store.getPlan(openedId) : null };
  } catch (error) {
    if (!isDbError(error)) throw error;
    console.error("[db] open-plan page failed", error.message);
    return (
      <Shell>
        <p role="alert" className="rounded-[10px] border border-red-500/50 bg-carbon-800 px-3 py-2 text-sm text-red-300">{dbProblemMessages[dbProblem(error)]}</p>
      </Shell>
    );
  }

  const { opened } = data;
  // After a save, start the next plan from the same source (Invoice / PO) the user just used.
  if (opened && !one(query.docType)) prefill.docType = opened.doc.docType;
  const nextHref = opened
    ? `/plans/new?${new URLSearchParams({ docType: opened.doc.docType, vendorId: String(opened.doc.vendorId), docNo: opened.doc.docNo })}`
    : null;

  return (
    <Shell>
      {opened && nextHref && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-pass/40 bg-carbon-800 px-4 py-3 text-sm">
          <p className="min-w-0 flex-1 text-ti-200">
            เปิดแผน <span className="whitespace-nowrap font-mono font-semibold text-pass">{opened.planNo}</span> แล้ว — {opened.model.code} · QC ต้องตรวจ {opened.qcRequired} จาก {opened.lotQty.toLocaleString("th-TH")} เครื่อง
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/plans/${opened.id}`} className="inline-flex h-10 items-center rounded-[10px] border border-ti-600 px-3 text-sm text-ti-200 hover:border-ti-400">
              ดูแผน
            </Link>
            <Link href={nextHref} className="inline-flex h-10 items-center rounded-[10px] border border-ember-500/70 px-3 text-sm text-ember-400 hover:bg-ember-500/10">
              เปิด Model ถัดไปใน{opened.doc.docType === "INVOICE" ? " Invoice" : " PO"} นี้
            </Link>
          </div>
        </div>
      )}
      {data.options.vendors.length === 0 || data.options.models.length === 0 ? (
        <p role="alert" className="rounded-[10px] border border-ember-500/50 bg-carbon-800 px-3 py-2 text-sm text-ember-400">
          ยังไม่มี{data.options.vendors.length === 0 ? " Vendor" : ""}{data.options.models.length === 0 ? " Model" : ""} ที่ใช้งานอยู่ — เพิ่มที่หน้าข้อมูลหลักก่อนเปิดแผน
        </p>
      ) : (
        // Re-key after a save so "เปิด Model ถัดไป" starts from a clean form.
        <OpenPlanForm key={`${openedId ?? "new"}-${prefill.docType}-${prefill.vendorId}-${prefill.docNo}`} options={data.options} settings={data.settings} today={thaiToday(new Date())} prefill={prefill} />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <Link href="/plans" className="text-sm text-ti-400 hover:text-ti-200">← รายการแผน</Link>
      <header className="space-y-1">
        <h1 className="text-2xl text-ti-50">เปิดแผนตรวจ</h1>
        <p className="text-sm text-ti-400">1 แผน = 1 Invoice/PO × 1 Model — เลขที่แผนออกอัตโนมัติเมื่อบันทึก</p>
      </header>
      {children}
    </div>
  );
}
