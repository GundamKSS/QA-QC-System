import Link from "next/link";
import type { CSSProperties } from "react";
import { displayValue } from "@/lib/master/form";
import { isListed, type MasterDef, type MasterField } from "@/lib/master/registry";
import type { MasterRowItem } from "@/lib/master/table";
import { ToggleActive } from "./MasterForms";


const when = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

type Props = {
  def: MasterDef;
  rows: MasterRowItem[];
  canEdit: boolean;
  saved: number | null;
  editHref: (id: number) => string;
};

function fieldWeight(field: MasterField) {
  if (field.kind === "bool" || field.kind === "number") return 0.8;
  if (field.kind === "text" && field.max > 150) return 2.3;
  return field.kind === "text" ? 1.5 : 1.15;
}

function Status({ active }: { active: boolean }) {
  return <span className={`master-status ${active ? "master-active" : "master-inactive"}`}><span aria-hidden="true" />{active ? "ใช้งาน" : "ปิดใช้งาน"}</span>;
}

function Value({ field, row }: { field: MasterField; row: MasterRowItem }) {
  const value = displayValue(field, row.values[field.key], row.labels[field.key]);
  return <span className={field.kind === "bool" ? "master-boolean" : field.key === "code" ? "master-code" : undefined}>{value}</span>;
}

function Stamp({ label, at, by }: { label: string; at: string; by: string | null }) {
  return <div className="master-stamp"><dt>{label}</dt><dd><time dateTime={at}>{when.format(new Date(at))}</time>{by && <span>{by}</span>}</dd></div>;
}

function History({ row, collapsible = false }: { row: MasterRowItem; collapsible?: boolean }) {
  const dates = <dl className="master-history"><Stamp label="แก้ไขล่าสุด" at={row.updatedAt} by={row.updatedBy} /><Stamp label="เพิ่มเมื่อ" at={row.createdAt} by={row.createdBy} /></dl>;
  if (collapsible) return <details className="master-history-details"><summary>ประวัติรายการ</summary>{dates}</details>;
  return <div className="master-table-history">
    <dl className="master-history"><Stamp label="แก้ไขล่าสุด" at={row.updatedAt} by={row.updatedBy} /></dl>
    <details className="master-created-details"><summary>ข้อมูลการสร้าง</summary><dl className="master-history"><Stamp label="เพิ่มเมื่อ" at={row.createdAt} by={row.createdBy} /></dl></details>
  </div>;
}

function Actions({ def, row, editHref }: { def: MasterDef; row: MasterRowItem; editHref: string }) {
  const label = displayValue(def.fields[0], row.values[def.fields[0].key]);
  return <div className="master-actions">
    <Link href={editHref} aria-label={`แก้ไข ${label}`} className="master-edit">แก้ไข</Link>
    <ToggleActive slug={def.slug} id={row.id} active={row.isActive} label={label} className="master-toggle" />
  </div>;
}

/** The available content width also accounts for the app's sidebar on tablets. */
export function MasterRecords({ def, rows, canEdit, saved, editHref }: Props) {
  const fields = def.fields.filter(isListed);
  const [primary, ...secondary] = fields;
  const weights = [...fields.map(fieldWeight), 1.3, 2, ...(canEdit ? [1.6] : [])];
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const dense = fields.length > 4;
  const fieldTotal = fields.reduce((sum, field) => sum + fieldWeight(field), 0);
  const widths = dense
    ? weights.map((weight) => `${weight / weightTotal * 100}%`)
    : [...fields.map((field) => `calc((100% - ${canEdit ? 500 : 300}px) * ${fieldWeight(field) / fieldTotal})`), "100px", "200px", ...(canEdit ? ["200px"] : [])];

  return <div className={`master-records ${dense ? "master-dense" : ""}`}>
    <div className="master-table-view">
      <div className="app-panel master-table-panel">
        <div className="master-table-scroll" role="region" aria-label={`ตาราง${def.singular} เลื่อนแนวนอนได้`} tabIndex={0}>
          <table className="master-table">
            <caption className="sr-only">{def.label}</caption>
            <colgroup>{widths.map((width, index) => <col key={index} style={{ width } as CSSProperties} />)}</colgroup>
            <thead><tr>
              {fields.map((field) => <th key={field.key} scope="col">{field.label}</th>)}
              <th scope="col">สถานะ</th>
              <th scope="col">ประวัติรายการ</th>
              {canEdit && <th scope="col" className="master-action-heading">จัดการ</th>}
            </tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id} className={row.id === saved ? "master-saved" : undefined}>
              {fields.map((field, index) => index === 0 ? <th key={field.key} scope="row"><Value field={field} row={row} /></th> : <td key={field.key}><Value field={field} row={row} /></td>)}
              <td><Status active={row.isActive} /></td>
              <td><History row={row} /></td>
              {canEdit && <td><Actions def={def} row={row} editHref={editHref(row.id)} /></td>}
            </tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
    <ul className="master-cards" aria-label={def.label}>
      {rows.map((row) => <li key={row.id} className={`app-panel master-card ${row.id === saved ? "master-saved" : ""}`}>
        <div className="master-card-body">
          <div className="master-card-heading">
            <div className="master-identity"><p>{primary.label}</p><h2><Value field={primary} row={row} /></h2></div>
            <Status active={row.isActive} />
          </div>
          {secondary.length > 0 && <dl className="master-card-fields">{secondary.map((field) => <div key={field.key} className={field.kind === "text" && field.max > 150 ? "master-wide-field" : undefined}><dt>{field.label}</dt><dd><Value field={field} row={row} /></dd></div>)}</dl>}
          <History row={row} collapsible />
        </div>
        {canEdit && <div className="master-card-footer"><Actions def={def} row={row} editHref={editHref(row.id)} /></div>}
      </li>)}
    </ul>
  </div>;
}
