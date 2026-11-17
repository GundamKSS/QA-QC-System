import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requirePageAccess } from "@/lib/auth/dal";
import { canAccessPage } from "@/lib/auth/page-access";
import { dbConfigured } from "@/lib/db/config";
import { dbProblem, dbProblemMessages, isDbError } from "@/lib/db/errors";
import { defaultValues, displayValue } from "@/lib/master/form";
import { isListed, masterBySlug, type MasterDef } from "@/lib/master/registry";
import { getMaster, listMaster, poolDb, refOptions, type MasterRow } from "@/lib/master/repo";
import { MasterForm, ToggleActive, type FieldOptions } from "./MasterForms";

export const metadata = { title: "ข้อมูลหลัก" };

type SearchParams = Record<string, string | string[] | undefined>;
const PAGE_SIZE = 50;
const when = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export default function MasterTablePage({ params, searchParams }: { params: Promise<{ table: string }>; searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={<p className="p-6 text-ti-400">กำลังโหลด…</p>}>
      <MasterTable params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function loadOptions(def: MasterDef): Promise<FieldOptions> {
  const options: FieldOptions = {};
  for (const field of def.fields) if (field.kind === "ref") options[field.key] = await refOptions(poolDb(), field.ref.table, field.ref.labelColumn);
  return options;
}

async function MasterTable({ params, searchParams }: { params: Promise<{ table: string }>; searchParams: Promise<SearchParams> }) {
  const { table } = await params;
  const def = masterBySlug(table);
  if (!def) notFound();
  const path = `/master/${def.slug}`;
  const user = await requirePageAccess("master", path);
  const canEdit = canAccessPage(user.roles, "master-edit");
  const query = await searchParams;
  const q = one(query.q).slice(0, 100);
  const statusParam = one(query.status);
  const status = statusParam === "active" || statusParam === "inactive" ? statusParam : "all";
  const page = Math.max(1, Number.parseInt(one(query.page), 10) || 1);
  const editId = /^\d{1,9}$/.test(one(query.edit)) ? Number(one(query.edit)) : null;
  const creating = one(query.new) === "1";
  const saved = /^\d{1,9}$/.test(one(query.saved)) ? Number(one(query.saved)) : null;

  if (!dbConfigured()) return <Shell def={def}><Alert>ยังไม่ได้ตั้งค่าฐานข้อมูล (DB_SERVER) — ข้อมูลหลักต้องใช้ SQL Server</Alert></Shell>;

  let data: { rows: MasterRow[]; total: number; editing: MasterRow | null; options: FieldOptions };
  try {
    const db = poolDb();
    const list = await listMaster(db, def, { q, status, page, pageSize: PAGE_SIZE });
    const editing = canEdit && editId !== null ? await getMaster(db, def, editId) : null;
    const options = canEdit && (creating || editing) ? await loadOptions(def) : {};
    data = { ...list, editing, options };
  } catch (error) {
    if (!isDbError(error)) throw error;
    console.error("[db] master list failed", error.message);
    return <Shell def={def}><Alert>{dbProblemMessages[dbProblem(error)]}</Alert></Shell>;
  }

  const listed = def.fields.filter(isListed);
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const link = (changes: Record<string, string | number | null>) => {
    const next = new URLSearchParams();
    const merged = { q, status: status === "all" ? "" : status, page: page > 1 ? String(page) : "", ...changes };
    for (const [key, value] of Object.entries(merged)) if (value !== null && value !== "") next.set(key, String(value));
    const text = next.toString();
    return text ? `${path}?${text}` : path;
  };
  const savedRow = saved !== null ? data.rows.find((row) => row.id === saved) : undefined;

  return (
    <Shell def={def} total={data.total} action={canEdit && !creating && !data.editing ? <Link href={link({ new: "1" })} className="inline-flex h-11 items-center rounded-[10px] app-primary-action bg-ember-500 px-4 text-sm font-semibold text-carbon-900 hover:bg-ember-400">+ เพิ่ม{def.singular}</Link> : null}>
      {saved !== null && <p role="status" className="rounded-[10px] border border-green-500/40 bg-carbon-800 px-3 py-2 text-sm text-green-300">บันทึกแล้ว{savedRow ? ` — ${displayValue(def.fields[0], savedRow.values[def.fields[0].key])}` : ""}</p>}

      {canEdit && creating && <MasterForm def={def} id={null} values={defaultValues(def)} options={data.options} cancelHref={link({})} />}
      {canEdit && data.editing && <MasterForm def={def} id={data.editing.id} values={data.editing.values} options={data.options} cancelHref={link({})} />}
      {canEdit && editId !== null && !data.editing && <Alert>ไม่พบรายการที่จะแก้ไข</Alert>}

      <form method="get" action={path} className="flex flex-wrap items-end gap-3" role="search">
        <label className="block min-w-[14rem] flex-1 space-y-1 text-sm text-ti-400">
          <span>ค้นหา</span>
          <input name="q" defaultValue={q} maxLength={100} placeholder="รหัส / ชื่อ" className="h-11 w-full rounded-[10px] border border-carbon-600 bg-carbon-900 px-3 text-sm text-ti-50 placeholder:text-ti-500 focus:border-ember-500" />
        </label>
        <label className="block space-y-1 text-sm text-ti-400">
          <span>สถานะ</span>
          <select name="status" defaultValue={status === "all" ? "" : status} className="h-11 rounded-[10px] border border-carbon-600 bg-carbon-900 px-3 text-sm text-ti-50">
            <option value="">ทั้งหมด</option>
            <option value="active">ใช้งาน</option>
            <option value="inactive">ปิดใช้งาน</option>
          </select>
        </label>
        <button type="submit" className="h-11 rounded-[10px] border border-ti-600 px-4 text-sm text-ti-200 hover:border-ti-400">ค้นหา</button>
      </form>

      {data.rows.length === 0 ? (
        <p className="app-panel rounded-xl border border-carbon-700 bg-carbon-800 p-5 text-sm text-ti-400">{q || status !== "all" ? "ไม่พบรายการที่ตรงกับเงื่อนไข" : `ยังไม่มี${def.singular}${canEdit ? " — กด “เพิ่ม” เพื่อเริ่ม" : ""}`}</p>
      ) : (
        <div className="overflow-x-auto app-panel rounded-xl border border-carbon-700 bg-carbon-800">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">{def.label}</caption>
            <thead className="bg-carbon-900 text-left text-xs text-ti-400">
              <tr>
                {listed.map((field) => <th key={field.key} scope="col" className="px-3 py-2 font-medium">{field.label}</th>)}
                <th scope="col" className="px-3 py-2 font-medium">สถานะ</th>
                <th scope="col" className="px-3 py-2 font-medium">วันที่เพิ่ม</th>
                <th scope="col" className="px-3 py-2 font-medium">วันที่แก้ไขล่าสุด</th>
                {canEdit && <th scope="col" className="px-3 py-2"><span className="sr-only">จัดการ</span></th>}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id} className={`border-t border-carbon-700 align-top hover:bg-carbon-700/30 ${row.isActive ? "text-ti-200" : "text-ti-500"} ${row.id === saved ? "bg-pass/10" : ""}`}>
                  {listed.map((field) => <td key={field.key} className="px-3 py-2">{displayValue(field, row.values[field.key], row.labels[field.key])}</td>)}
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${row.isActive ? "border-green-500/50 text-green-300" : "border-carbon-600 text-ti-400"}`}>{row.isActive ? "ใช้งาน" : "ปิดใช้งาน"}</span>
                  </td>
                  <td className="px-3 py-2 text-xs"><Stamp at={row.createdAt} by={row.createdBy} /></td>
                  <td className="px-3 py-2 text-xs"><Stamp at={row.updatedAt} by={row.updatedBy} /></td>
                  {canEdit && (
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Link href={link({ edit: row.id })} className="inline-flex h-9 items-center rounded-[10px] border border-ti-600 px-3 text-xs text-ti-200 hover:border-ti-400">แก้ไข</Link>
                        <ToggleActive slug={def.slug} id={row.id} active={row.isActive} label={displayValue(def.fields[0], row.values[def.fields[0].key])} />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="หน้า" className="flex items-center justify-between text-sm text-ti-400">
          {page > 1 ? <Link href={link({ page: page - 1 })} className="underline-offset-4 hover:underline">← ก่อนหน้า</Link> : <span />}
          <span>หน้า {page} / {pages}</span>
          {page < pages ? <Link href={link({ page: page + 1 })} className="underline-offset-4 hover:underline">ถัดไป →</Link> : <span />}
        </nav>
      )}
    </Shell>
  );
}

function Stamp({ at, by }: { at: Date; by: string | null }) {
  return (
    <>
      <span className="block text-ti-200">{when.format(at)}</span>
      {by && <span className="block text-ti-500">{by}</span>}
    </>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return <p role="alert" className="rounded-[10px] border border-red-500/50 bg-carbon-800 px-3 py-2 text-sm text-red-300">{children}</p>;
}

function Shell({ def, total, action, children }: { def: MasterDef; total?: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <Link href="/master" className="text-sm text-ti-400 hover:text-ti-200">← ข้อมูลหลัก</Link>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl text-ti-50">{def.label}{total !== undefined && <span className="ml-2 font-mono text-base text-ti-400">({total})</span>}</h1>
          <p className="text-sm text-ti-400">{def.description}</p>
        </div>
        {action}
      </header>
      {children}
    </div>
  );
}
