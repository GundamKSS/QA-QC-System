"use client";

import Link from "next/link";
import { AppBack } from "@/components/ui/AppBack";
import { LoadError } from "@/components/feedback/LoadError";
import { useMasterCounts } from "./useMasterCounts";

/** Not built yet — listed so people know where they will live (docs/02 FR-MD-05/06/08/10/11). */
const LATER = ["กติกาอาการต่อหัวข้อ (ความรุนแรง + Disposition PUMA/อื่นๆ)", "ตาราง AQL", "ค่าแรงต่อความซับซ้อน/ความรุนแรง", "ค่าตั้งระบบ", "นำเข้า/ส่งออก Excel"];

/** One card: a table of the master registry, as much of it as the index shows. */
export type MasterCard = { slug: string; label: string; description: string };

type Props = {
  /** Master Admin: may add, change and switch off rows (`master-edit`); everyone else who opens the page only looks. */
  canEdit: boolean;
  /** The tables to list, from the registry (the page picks the three fields drawn here). */
  masters: readonly MasterCard[];
};

/**
 * ข้อมูลหลัก: the list of master tables, each with "rows in use / all rows". The page checks the role and
 * hands over the cards; the numbers are read from `GET /api/master`. Until they arrive — or when they can't be
 * read (no database, database down) — the cards are still there, only without a number.
 */
export function MasterIndex({ canEdit, masters }: Props) {
  const { data, loading, error, reload } = useMasterCounts();
  return (
    <div className="min-w-0 w-full space-y-6 p-4 sm:p-6">
      <AppBack href="/home">กลับหน้าหลัก</AppBack>
      <header className="space-y-1">
        <h1 className="text-2xl text-ti-50">ข้อมูลหลัก</h1>
        <p className="text-sm text-ti-400">{canEdit ? "Master Admin เพิ่ม แก้ไข และปิดใช้งานได้ (ไม่มีการลบ)" : "ดูได้อย่างเดียว — การแก้ไขทำโดย Master Admin"}</p>
      </header>
      {error && <LoadError message={error} onRetry={reload} />}
      <ul aria-busy={loading} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {masters.map((def) => {
          const count = data?.counts[def.slug];
          return (
            <li key={def.slug}>
              <Link href={`/master/${def.slug}`} className="block h-full space-y-2 app-panel rounded-panel border border-carbon-700 bg-carbon-800 p-5 transition-colors hover:border-ti-500">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-base font-medium text-ti-50">{def.label}</span>
                  {count ? (
                    <span className="shrink-0 font-mono text-sm text-ti-400">{count.active}<span className="text-ti-500">/{count.total}</span></span>
                  ) : (
                    loading && <span aria-hidden="true" className="h-4 w-10 shrink-0 animate-pulse rounded bg-carbon-700" />
                  )}
                </span>
                <span className="block text-sm text-ti-400">{def.description}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-ti-500">ตัวเลข = ใช้งานอยู่ / ทั้งหมด</p>
      <section aria-labelledby="later" className="space-y-2">
        <h2 id="later" className="text-sm font-medium text-ti-400">ยังไม่เปิดใช้</h2>
        <ul className="flex flex-wrap gap-2">
          {LATER.map((item) => <li key={item} className="rounded-full border border-carbon-600 px-3 py-1 text-xs text-ti-500">{item}</li>)}
        </ul>
      </section>
    </div>
  );
}
