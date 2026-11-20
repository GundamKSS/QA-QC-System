import type { JobCard } from "@/lib/plans/store";
import type { WorkNotification } from "./types";

/** Keep returned work first and the oldest call-ins next. CALLIN_FIX still has assigned people (W9). */
export function workNotifications(jobs: readonly JobCard[]): WorkNotification[] {
  return jobs
    .filter((job): job is JobCard & { status: WorkNotification["status"] } => job.status === "IN_PROGRESS" || job.status === "RETURNED")
    .sort((a, b) => Number(b.status === "RETURNED") - Number(a.status === "RETURNED") || a.calledDate.localeCompare(b.calledDate) || a.woNo.localeCompare(b.woNo))
    .map((job) => ({
      // A returned order deserves attention even if its original assignment was read.
      id: `work-order:${job.id}:${job.status}`,
      workOrderId: job.id,
      kind: job.status === "RETURNED" ? "returned" : "assigned",
      status: job.status,
      title: job.status === "RETURNED" ? "งานถูกตีกลับให้แก้ไข" : job.type === "QA" ? "คุณได้รับมอบหมายงานสุ่มตรวจ QA" : "คุณมีงานที่ต้องทำ",
      body: `${job.woNo} · ${job.modelCode} · ${job.type === "CALLIN_FIX" ? "เรียกเข้าแก้ไข — ไม่ต้องตรวจในแอป" : `ตรวจแล้ว ${job.qtyDone.toLocaleString("th-TH")} / ${job.qtyNeed.toLocaleString("th-TH")} เครื่อง`}`,
      // QC Inspectors open /jobs; QA Inspectors open /qa-queue.
      href:
        job.type === "QA"
          ? `/qa-queue?plan=${job.planId}`
          : `/jobs?view=mine&notification=${encodeURIComponent(`${job.id}:${job.status}`)}#work-order-${encodeURIComponent(job.id)}`,
      createdAt: job.createdAt.toISOString(),
      woNo: job.woNo,
      modelCode: job.modelCode,
      calledDate: job.calledDate,
      qtyNeed: job.qtyNeed,
      qtyDone: job.qtyDone,
      type: job.type,
    }));
}
