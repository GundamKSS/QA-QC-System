/**
 * Master data the app can list and edit (docs/02 FR-MD-01…09, docs/03 §3.1). One definition per
 * table drives the list page, the edit form, validation and the SQL — so adding a master is one
 * entry here plus its migration, and `registry.test.ts` checks every column against `db/*.sql`.
 *
 * Every master table also carries the standard columns of docs/03 §3.0 (status, created/updated
 * date and who); those are handled by the generic code, not listed per field.
 */
export type Option = { value: string; label: string };

type Base = { key: string; label: string; required?: boolean; help?: string; /** Shown as a column in the list (default true). */ list?: boolean };

export type MasterField =
  | (Base & { kind: "text"; max: number; /** Searched by the list's search box (default true). */ searchable?: boolean })
  | (Base & { kind: "number"; min: number; maxValue: number; default?: number })
  | (Base & { kind: "bool"; default: boolean })
  | (Base & { kind: "enum"; options: readonly Option[]; default?: string })
  | (Base & { kind: "ref"; ref: { table: string; labelColumn: string } });

export type MasterDef = {
  /** URL segment: /master/<slug> */
  slug: string;
  /** SQL table (schema dbo). Never taken from user input. */
  table: string;
  label: string;
  singular: string;
  description: string;
  fields: readonly MasterField[];
  /** ORDER BY expression over the alias `t`. */
  orderBy: string;
};

const yesNo = { true: "ใช่", false: "ไม่ใช่" } as const;
export const boolLabel = (value: boolean) => (value ? yesNo.true : yesNo.false);

export const MASTERS: readonly MasterDef[] = [
  {
    slug: "brands",
    table: "brands",
    label: "ยี่ห้อ (Brand)",
    singular: "ยี่ห้อ",
    description: "ยี่ห้อปั๊มและกลุ่ม PUMA / อื่นๆ ที่ใช้กับตาราง Disposition",
    orderBy: "t.name",
    fields: [
      { key: "name", label: "ชื่อยี่ห้อ", kind: "text", max: 64, required: true },
      { key: "brand_group", label: "กลุ่ม", kind: "enum", required: true, default: "OTHER", options: [{ value: "PUMA", label: "PUMA" }, { value: "OTHER", label: "อื่นๆ" }] },
    ],
  },
  {
    slug: "pump-types",
    table: "pump_types",
    label: "ประเภทปั๊ม",
    singular: "ประเภทปั๊ม",
    description: "Piston, Oil-free, Rotary … ใช้กรองและแยก Defect/Checklist ตามประเภท",
    orderBy: "t.code",
    fields: [
      { key: "code", label: "รหัส", kind: "text", max: 32, required: true, help: "ตัวพิมพ์ใหญ่/ขีดล่าง เช่น PISTON, OIL_FREE" },
      { key: "name", label: "ชื่อ", kind: "text", max: 100, required: true },
    ],
  },
  {
    slug: "vendors",
    table: "vendors",
    label: "ผู้ขาย / ผู้ผลิต (Vendor)",
    singular: "ผู้ขาย",
    description: "Supplier สำหรับ KPI Vendor และ NCP",
    orderBy: "t.name",
    fields: [
      { key: "name", label: "ชื่อ", kind: "text", max: 200, required: true },
      { key: "country", label: "ประเทศ", kind: "text", max: 64 },
    ],
  },
  {
    slug: "models",
    table: "models",
    label: "รุ่นปั๊ม (Model)",
    singular: "รุ่น",
    description: "รุ่น/SKU ผูกยี่ห้อ ประเภทปั๊ม แหล่งที่มา และการสแกน (Checklist และ AQL ผูกภายหลัง)",
    orderBy: "t.code",
    fields: [
      { key: "code", label: "รหัสรุ่น", kind: "text", max: 64, required: true },
      { key: "description", label: "คำอธิบาย", kind: "text", max: 400 },
      { key: "brand_id", label: "ยี่ห้อ", kind: "ref", required: true, ref: { table: "brands", labelColumn: "name" } },
      { key: "pump_type_id", label: "ประเภทปั๊ม", kind: "ref", ref: { table: "pump_types", labelColumn: "name" } },
      { key: "origin", label: "แหล่งที่มา", kind: "enum", required: true, default: "IMPORTED", options: [{ value: "IMPORTED", label: "นำเข้า" }, { value: "DOMESTIC", label: "ผลิตเอง" }] },
      {
        key: "default_aql_level", label: "AQL ตั้งต้น", kind: "enum", help: "เว้นว่าง = ตามแหล่งที่มา",
        options: [{ value: "REDUCED", label: "Reduced" }, { value: "NORMAL", label: "Normal" }, { value: "TIGHTENED", label: "Tightened" }],
      },
      { key: "is_scannable", label: "สแกนได้", kind: "bool", default: false },
      { key: "barcode_pattern", label: "รูปแบบบาร์โค้ด", kind: "text", max: 200, list: false },
    ],
  },
  {
    slug: "defects",
    table: "defects",
    label: "อาการ / Defect",
    singular: "อาการ",
    description: "อาการมาตรฐาน ความรุนแรง ความซับซ้อน (ค่าแรง) และสาเหตุตั้งต้น (Disposition แยกตาราง)",
    orderBy: "t.code",
    fields: [
      { key: "code", label: "รหัส", kind: "text", max: 32, required: true },
      { key: "name_th", label: "ชื่ออาการ (ไทย)", kind: "text", max: 200, required: true },
      { key: "name_en", label: "ชื่ออาการ (อังกฤษ)", kind: "text", max: 200, list: false },
      { key: "category", label: "หมวด", kind: "text", max: 64, help: "เช่น Leakage, Assembly Issue, Performance, Cosmetic, Electrical" },
      { key: "severity", label: "ความรุนแรง", kind: "enum", required: true, default: "MINOR", options: [{ value: "MINOR", label: "Minor" }, { value: "MAJOR", label: "Major" }, { value: "CRITICAL", label: "Critical" }] },
      { key: "complexity", label: "ความซับซ้อน (1–4)", kind: "number", required: true, min: 1, maxValue: 4, default: 1 },
      { key: "requires_video", label: "ต้องมีวิดีโอ", kind: "bool", default: false },
      { key: "is_claimable", label: "เคลมได้", kind: "bool", default: true },
      {
        key: "cause_type_default", label: "สาเหตุตั้งต้น", kind: "enum", required: true, default: "UNKNOWN", list: false,
        options: [{ value: "SUPPLIER", label: "Supplier" }, { value: "TRANSPORT", label: "ขนส่ง" }, { value: "INTERNAL", label: "ภายใน" }, { value: "UNKNOWN", label: "ไม่ทราบ" }],
      },
    ],
  },
  {
    slug: "fix-methods",
    table: "fix_methods",
    label: "วิธีแก้ไข",
    singular: "วิธีแก้ไข",
    description: "เปลี่ยน, ซ่อม/ปรับแต่ง, พ่นสี, อื่นๆ",
    orderBy: "t.name",
    fields: [{ key: "name", label: "ชื่อ", kind: "text", max: 100, required: true }],
  },
];

export function masterBySlug(slug: string): MasterDef | undefined {
  return MASTERS.find((master) => master.slug === slug);
}

export const isListed = (field: MasterField) => field.list !== false;
export const isSearchable = (field: MasterField) => field.kind === "text" && field.searchable !== false;
