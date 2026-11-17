import Link from "next/link";
import { Suspense } from "react";
import { requirePageAccess } from "@/lib/auth/dal";
import { canAccessPage } from "@/lib/auth/page-access";
import { dbConfigured } from "@/lib/db/config";
import { dbProblem, dbProblemMessages, isDbError } from "@/lib/db/errors";
import { MASTERS } from "@/lib/master/registry";
import { masterCounts, poolDb } from "@/lib/master/repo";

export const metadata = { title: "ข้อมูลหลัก" };

/** Not built yet — listed so people know where they will live (docs/02 FR-MD-05/06/08/10/11). */
const LATER = ["Checklist Template + เวอร์ชัน", "ตาราง Disposition (QC/QA × PUMA/อื่นๆ)", "ตาราง AQL", "ค่าแรงต่อความซับซ้อน/ความรุนแรง", "ค่าตั้งระบบ", "นำเข้า/ส่งออก Excel"];

export default function MasterIndexPage() {
  return (
    <Suspense fallback={<p className="p-6 text-ti-400">กำลังโหลดข้อมูลหลัก…</p>}>
      <MasterIndex />
    </Suspense>
  );
}

async function loadCounts(): Promise<{ counts: { total: number; active: number }[] } | { error: string }> {
  if (!dbConfigured()) return { error: "ยังไม่ได้ตั้งค่าฐานข้อมูล (DB_SERVER) — ข้อมูลหลักต้องใช้ SQL Server" };
  try {
    const db = poolDb();
    return { counts: await Promise.all(MASTERS.map((def) => masterCounts(db, def))) };
  } catch (error) {
    if (!isDbError(error)) throw error;
    console.error("[db] master counts failed", error.message);
    return { error: dbProblemMessages[dbProblem(error)] };
  }
}

async function MasterIndex() {
  const user = await requirePageAccess("master", "/master");
  const canEdit = canAccessPage(user.roles, "master-edit");
  const loaded = await loadCounts();

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl text-ti-50">ข้อมูลหลัก</h1>
        <p className="text-sm text-ti-400">{canEdit ? "Master Admin เพิ่ม แก้ไข และปิดใช้งานได้ (ไม่มีการลบ)" : "ดูได้อย่างเดียว — การแก้ไขทำโดย Master Admin"}</p>
      </header>
      {"error" in loaded && <p role="alert" className="rounded-[10px] border border-red-500/50 bg-carbon-800 px-3 py-2 text-sm text-red-300">{loaded.error}</p>}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MASTERS.map((def, index) => {
          const count = "counts" in loaded ? loaded.counts[index] : null;
          return (
            <li key={def.slug}>
              <Link href={`/master/${def.slug}`} className="block h-full space-y-2 app-panel rounded-xl border border-carbon-700 bg-carbon-800 p-5 transition-colors hover:border-ti-500">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-base font-medium text-ti-50">{def.label}</span>
                  {count && <span className="shrink-0 font-mono text-sm text-ti-400">{count.active}<span className="text-ti-500">/{count.total}</span></span>}
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
