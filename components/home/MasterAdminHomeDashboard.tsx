"use client";

import Link from "next/link";
import { ChevronRightIcon } from "@/components/dom/Icons";
import { LoadError } from "@/components/feedback/LoadError";
import type { MasterCard } from "@/components/master/MasterIndex";
import { useMasterCounts } from "@/components/master/useMasterCounts";

const cardClass = "app-panel rounded-panel border border-carbon-700/80 bg-carbon-800";

type Props = {
  canEdit: boolean;
  masters: readonly MasterCard[];
};

/**
 * Dedicated Home Dashboard for Master Admin (`DEMO_MADMIN`) and master-only roles.
 * Reads live row counts via `GET /api/master` (`useMasterCounts`) and gives 1-click access
 * to every master table and the checklist template configurator.
 */
export function MasterAdminHomeDashboard({ canEdit, masters }: Props) {
  const { data, loading, error, reload } = useMasterCounts();

  const counts = data?.counts ?? null;
  let totalActive = 0;
  let totalAll = 0;
  if (counts) {
    for (const def of masters) {
      const c = counts[def.slug];
      if (c) {
        totalActive += c.active;
        totalAll += c.total;
      }
    }
  }
  const totalInactive = Math.max(0, totalAll - totalActive);
  const modelsCount = counts?.["models"];
  const templatesCount = counts?.["checklist-templates"];

  return (
    <div className="space-y-6">
      {error && <LoadError message={error} onRetry={reload} />}

      {/* ZONE 1: Master Data Overview KPIs */}
      <section aria-label="สรุปสถานะข้อมูลหลัก" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-ti-200 uppercase tracking-wider">
              ภาพรวมข้อมูลหลักระบบ (Master Data)
            </h2>
            <span className="rounded border border-ember-500/30 bg-ember-500/10 px-2 py-0.5 text-[11px] font-medium text-ember-300">
              {canEdit ? "สิทธิ์เพิ่ม / แก้ไข / ปิดใช้งาน" : "ดูได้อย่างเดียว"}
            </span>
          </div>
          <Link
            href="/master"
            className="text-xs text-ti-400 hover:text-ember-400 flex items-center gap-1 transition-colors"
          >
            <span>เปิดหน้าข้อมูลหลัก</span>
            <ChevronRightIcon className="size-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className={`${cardClass} p-4.5 space-y-2`}>
            <span className="text-xs text-ti-400 font-medium">หมวดข้อมูลหลัก</span>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-3xl font-semibold text-ti-50">{masters.length}</span>
              <span className="text-xs text-ti-400">ตาราง</span>
            </div>
            <p className="text-xs text-ti-400">ยี่ห้อ รุ่น ผู้ขาย อาการ และเช็กลิสต์</p>
          </div>

          <div className={`${cardClass} p-4.5 space-y-2`}>
            <span className="text-xs text-ti-400 font-medium">รายการที่เปิดใช้งาน</span>
            <div className="flex items-baseline gap-2">
              {counts ? (
                <span className="font-mono text-3xl font-semibold text-emerald-400">
                  {totalActive.toLocaleString("th-TH")}
                </span>
              ) : (
                <span aria-hidden="true" className="h-8 w-16 animate-pulse rounded bg-carbon-700" />
              )}
              <span className="text-xs text-ti-400">รายการ</span>
            </div>
            <p className="text-xs text-ti-400">
              {counts ? `จากทั้งหมด ${totalAll.toLocaleString("th-TH")} รายการ` : "กำลังโหลดตัวเลข…"}
            </p>
          </div>

          <div className={`${cardClass} p-4.5 space-y-2`}>
            <span className="text-xs text-ti-400 font-medium">รายการที่ปิดใช้งาน</span>
            <div className="flex items-baseline gap-2">
              {counts ? (
                <span className="font-mono text-3xl font-semibold text-ti-200">
                  {totalInactive.toLocaleString("th-TH")}
                </span>
              ) : (
                <span aria-hidden="true" className="h-8 w-14 animate-pulse rounded bg-carbon-700" />
              )}
              <span className="text-xs text-ti-400">รายการ</span>
            </div>
            <p className="text-xs text-ti-400">เก็บประวัติเดิมไว้ ไม่ลบถาวร</p>
          </div>

          <div className={`${cardClass} p-4.5 space-y-2`}>
            <span className="text-xs text-ti-400 font-medium">รุ่นปั๊ม / เทมเพลตเช็กลิสต์</span>
            <div className="flex items-baseline gap-2">
              {counts ? (
                <span className="font-mono text-3xl font-semibold text-ember-400">
                  {modelsCount?.active ?? 0}
                  <span className="text-lg text-ti-500"> / {templatesCount?.active ?? 0}</span>
                </span>
              ) : (
                <span aria-hidden="true" className="h-8 w-20 animate-pulse rounded bg-carbon-700" />
              )}
              <span className="text-xs text-ti-400">รุ่น / ชุด</span>
            </div>
            <p className="text-xs text-ti-400">พร้อมใช้งานในแผนตรวจ QC & QA</p>
          </div>
        </div>
      </section>

      {/* ZONE 2: 1-Click Master Table Shortcuts */}
      <section aria-label="ทางลัดจัดการตารางข้อมูลหลัก" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ti-200 uppercase tracking-wider">
            จัดการตารางข้อมูลหลัก ({masters.length})
          </h2>
          <Link
            href="/master/checklist-templates"
            className="text-xs text-ember-400 hover:text-ember-300 flex items-center gap-1 font-medium transition-colors"
          >
            <span>ตั้งค่าเทมเพลตเช็กลิสต์</span>
            <ChevronRightIcon className="size-3.5" />
          </Link>
        </div>

        <ul aria-busy={loading} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {masters.map((def) => {
            const count = counts?.[def.slug];
            return (
              <li key={def.slug}>
                <Link
                  href={`/master/${def.slug}`}
                  className={`${cardClass} block h-full space-y-2 p-5 transition-colors hover:border-ember-500/60`}
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-base font-medium text-ti-50">{def.label}</span>
                    {count ? (
                      <span className="shrink-0 font-mono text-sm text-emerald-400">
                        {count.active}
                        <span className="text-ti-500">/{count.total}</span>
                      </span>
                    ) : (
                      loading && <span aria-hidden="true" className="h-4 w-10 shrink-0 animate-pulse rounded bg-carbon-700" />
                    )}
                  </span>
                  <span className="block text-xs sm:text-sm text-ti-400 line-clamp-2">{def.description}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
