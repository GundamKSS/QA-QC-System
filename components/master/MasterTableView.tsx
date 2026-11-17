"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { CardsSkeleton } from "@/components/feedback/CardsSkeleton";
import { LoadError } from "@/components/feedback/LoadError";
import { defaultValues, displayValue } from "@/lib/master/form";
import type { MasterDef } from "@/lib/master/registry";
import { masterTableHref, type MasterTableValues } from "@/lib/master/table-query";
import { MasterBack } from "./MasterBack";
import { MasterHero } from "./MasterHero";
import { MasterFilters } from "./MasterFilters";
import { MasterForm } from "./MasterForms";
import { MasterRecords } from "./MasterRecords";
import { ModelChecklistConfiguratorView } from "./ModelChecklistConfiguratorView";
import { useMasterTable } from "./useMasterTable";
import "./master-table.css";

type Props = {
  def: MasterDef;
  /** Master Admin: may add, change and switch off rows (`master-edit`); everyone else who opens the page only looks. */
  canEdit: boolean;
  /** Admin / Master Admin / QC Head / QA Head may configure checklist steps & publish versions. */
  canEditChecklist?: boolean;
  /** What the address says (filters, open form, just-saved row), already parsed by the page. */
  values: MasterTableValues;
};

/**
 * One master table (FR-MD-01…09): the search form, the rows and, for Master Admin, the create / edit form. The
 * page checks the role and parses the address; the rows come from `GET /api/master/<table>` and load again by
 * themselves whenever the address changes or a form saves (a row switched on/off). The header, the search form
 * and the back link don't wait for the data.
 */
export function MasterTableView({ def, canEdit, canEditChecklist, values }: Props) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const { data, loading, error, reload } = useMasterTable(def.slug, values);
  const { q, status, page, editId, creating, saved } = values;
  const path = `/master/${def.slug}`;
  const link = (changes: Record<string, string | number | null> = {}) => masterTableHref(def.slug, values, changes);
  const filtered = Boolean(q) || status !== "all";

  if (def.slug === "checklist-templates" && selectedTemplateId !== null) {
    return (
      <ModelChecklistConfiguratorView
        canEdit={canEditChecklist ?? canEdit}
        initialTemplateId={selectedTemplateId}
        onBack={() => {
          setSelectedTemplateId(null);
          reload();
        }}
      />
    );
  }

  const rows = data?.rows ?? [];
  const pageSize = data?.pageSize ?? 0;
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const savedRow = saved !== null ? rows.find((row) => row.id === saved) : undefined;
  // A form is drawn only from data that has what it needs (the options, the row being edited), and stays while a
  // reload runs, so switching a row on/off in the list under an open form doesn't wipe what was typed.
  const options = data?.options ?? null;
  const editing = canEdit && editId !== null && data?.editing?.id === editId ? data.editing : null;
  const editMissing = canEdit && editId !== null && !loading && data !== null && data.editing === null;
  const formReady = options !== null && (creating || editing !== null);
  const formWaiting = canEdit && (creating || editId !== null) && !error && !formReady && !editMissing;

  return (
    <div className="master-page"><div className="master-content">
      <MasterBack />
      <MasterHero>
        <header className="master-header">
          <div className="master-title-block">
            <p className="master-eyebrow" lang="en">Master data</p>
            <div className="master-title-line"><h1 id="master-title">{def.label}</h1>{data && <span className="master-count">{data.total.toLocaleString("th-TH")} รายการ</span>}</div>
            <p className="master-description">{def.description}</p>
          </div>
          {canEdit && !creating && (editId === null || editMissing) && (
            <Link href={link({ new: "1" })} className="app-primary-action bg-ember-500 text-carbon-900 hover:bg-ember-400 master-add"><span aria-hidden="true" className="text-xl font-normal">+</span>เพิ่ม{def.singular}</Link>
          )}
        </header>

        <MasterFilters key={JSON.stringify([def.slug, q, status])} slug={def.slug} singular={def.singular} q={q} status={status} />
      </MasterHero>

      {saved !== null && <p role="status" className="rounded-control border border-green-500/40 bg-carbon-800 px-3 py-2 text-sm text-green-300">บันทึกแล้ว{savedRow ? ` — ${displayValue(def.fields[0], savedRow.values[def.fields[0].key])}` : ""}</p>}

      {canEdit && creating && options && <MasterForm key="new" def={def} id={null} values={defaultValues(def)} options={options} cancelHref={link()} />}
      {canEdit && editing && options && <MasterForm key={`edit-${editing.id}`} def={def} id={editing.id} values={editing.values} options={options} cancelHref={link()} />}
      {formWaiting && <div role="status" aria-label="กำลังโหลดฟอร์ม" aria-busy="true" className="app-panel h-40 animate-pulse rounded-panel border border-carbon-700 bg-carbon-800" />}
      {editMissing && <Alert>ไม่พบรายการที่จะแก้ไข</Alert>}


      {error && <LoadError message={error} onRetry={reload} />}

      {data === null ? (
        !error && <CardsSkeleton label="กำลังโหลดรายการ" />
      ) : (
        <div aria-busy={loading} className={`grid min-w-0 gap-5 transition-opacity ${loading ? "opacity-60" : ""}`}>
          <div className="master-result-bar">
            <p>{rows.length > 0 ? <>แสดง <strong>{(data.page - 1) * pageSize + 1}–{(data.page - 1) * pageSize + rows.length}</strong> จาก <strong>{data.total.toLocaleString("th-TH")}</strong> รายการ</> : "0 รายการ"}</p>
            {filtered && <Link href={path} className="master-clear">ล้างตัวกรอง</Link>}
          </div>

          {rows.length === 0 ? (
            <div className="app-panel master-empty">
              <span className="master-empty-icon" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M4 9h16M9 9v11" /></svg></span>
              <h2>{filtered ? "ไม่พบรายการที่ตรงกับเงื่อนไข" : `ยังไม่มี${def.singular}`}</h2>
              <p>{filtered ? "ลองค้นหาด้วยคำอื่น หรือเปลี่ยนตัวกรองสถานะ" : canEdit ? `กด “เพิ่ม${def.singular}” เพื่อเริ่มบันทึกข้อมูล` : "รายการจะแสดงที่นี่เมื่อมีการเพิ่มข้อมูล"}</p>
              {filtered && <Link href={path} className="master-clear">แสดงรายการทั้งหมด</Link>}
            </div>
          ) : (
            <MasterRecords
              def={def}
              rows={rows}
              canEdit={canEdit}
              saved={saved}
              editHref={(id) => link({ edit: id })}
              onSelectTemplate={
                def.slug === "checklist-templates"
                  ? (id) => setSelectedTemplateId(id)
                  : undefined
              }
            />
          )}

          {pages > 1 && (
            <nav aria-label="หน้ารายการข้อมูลหลัก" className="master-pagination">
              {page > 1 ? <Link href={link({ page: page - 1 })}>← ก่อนหน้า</Link> : <span />}
              <span>หน้า {data.page} / {pages}</span>
              {page < pages ? <Link href={link({ page: page + 1 })}>ถัดไป →</Link> : <span />}
            </nav>
          )}
        </div>
      )}
    </div></div>
  );
}

function Alert({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-control border border-red-500/50 bg-carbon-800 px-3 py-2 text-sm text-red-300">{children}</p>;
}
