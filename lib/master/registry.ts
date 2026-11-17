/**
 * Master data the app can list and edit (docs/02 FR-MD-01…09, docs/03 §3.1). One definition per
 * table drives the list page, the edit form, validation and the SQL — so adding a master is one
 * entry here plus its migration, and `tests/master.test.ts` checks every column against `db/*.sql`.
 *
 * Every master table also carries the standard columns of docs/03 §3.0 (status, created/updated
 * date and who); those are handled by the generic code, not listed per field.
 */
export type Option = { value: string; label: string };

type Base = {
  key: string;
  label: string;
  required?: boolean;
  help?: string;
  /** Shown as a column in the list (default true). */
  list?: boolean;
  /** Filled by the database (a DEFAULT, e.g. DEF00001 from a SEQUENCE): never sent on insert/update, shown read-only. */
  generated?: boolean;
};

export type MasterField =
  | (Base & { kind: "text"; max: number; /** Searched by the list's search box (default true). */ searchable?: boolean })
  | (Base & { kind: "number"; min: number; maxValue: number; default?: number; step?: number })
  | (Base & { kind: "bool"; default: boolean })
  | (Base & { kind: "enum"; options: readonly Option[]; default?: string })
  | (Base & { kind: "ref"; ref: { table: string; labelColumn: string; filter?: { column: string; value: string } } });

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
    slug: "checklist-templates",
    table: "checklist_templates",
    label: "เทมเพลตเช็คลิสต์ (Checklist Template)",
    singular: "เทมเพลตเช็คลิสต์",
    description: "แม่แบบชุดข้อตรวจมาตรฐาน — กดที่รหัส Template เพื่อจัดลำดับข้อตรวจ เพิ่ม/ลบ/แก้ไข และดูประวัติเวอร์ชัน",
    orderBy: "t.role, t.code",
    fields: [
      { key: "code", label: "รหัส Template", kind: "text", max: 64, required: true, help: "เช่น TPL-QC-01, QC-PISTON" },
      { key: "name", label: "ชื่อ Template", kind: "text", max: 200, required: true, help: "เช่น Template 1 — ปั๊มลูกสูบมาตรฐาน" },
      {
        key: "role",
        label: "ฝั่งตรวจ",
        kind: "enum",
        required: true,
        default: "QC",
        options: [
          { value: "QC", label: "QC" },
          { value: "QA", label: "QA" },
        ],
      },
      { key: "scope", label: "ขอบเขต / ประเภทปั๊ม", kind: "text", max: 100, help: "เช่น Piston, Oil-free, Rotary หรือแผนก" },
    ],
  },
  {
    slug: "models",
    table: "models",
    label: "รุ่นปั๊ม (Model)",
    singular: "รุ่น",
    description: "รุ่น/SKU ผูกยี่ห้อ ประเภทปั๊ม แหล่งที่มา เทมเพลตเช็คลิสต์ (QC/QA) และการสแกน",
    orderBy: "t.code",
    fields: [
      { key: "code", label: "รหัสรุ่น", kind: "text", max: 64, required: true },
      { key: "description", label: "คำอธิบาย", kind: "text", max: 400 },
      { key: "brand_id", label: "ยี่ห้อ", kind: "ref", required: true, ref: { table: "brands", labelColumn: "name" } },
      { key: "pump_type_id", label: "ประเภทปั๊ม", kind: "ref", ref: { table: "pump_types", labelColumn: "name" } },
      { key: "vendor_id", label: "Vendor ตั้งต้น", kind: "ref", ref: { table: "vendors", labelColumn: "name" }, help: "ตอนเปิดแผนเลือกรุ่นนี้ ระบบจะเติม Vendor นี้ให้ก่อน (เปลี่ยนเองได้)" },
      { key: "origin", label: "แหล่งที่มา", kind: "enum", required: true, default: "IMPORTED", options: [{ value: "IMPORTED", label: "นำเข้า" }, { value: "DOMESTIC", label: "ผลิตเอง" }] },
      {
        key: "default_aql_level", label: "AQL ตั้งต้น", kind: "enum", help: "เว้นว่าง = ตามแหล่งที่มา",
        options: [{ value: "REDUCED", label: "Reduced" }, { value: "NORMAL", label: "Normal" }, { value: "TIGHTENED", label: "Tightened" }],
      },
      { key: "is_scannable", label: "สแกนได้", kind: "bool", default: false },
      { key: "barcode_pattern", label: "รูปแบบบาร์โค้ด", kind: "text", max: 200, list: false },
      {
        key: "qc_template_id",
        label: "Template เช็คลิสต์ (QC)",
        kind: "ref",
        ref: { table: "checklist_templates", labelColumn: "name", filter: { column: "role", value: "QC" } },
        help: "เลือก Template เช็คลิสต์ฝั่ง QC ที่สร้างไว้ใน Checklist Builder",
      },
      {
        key: "qa_template_id",
        label: "Template เช็คลิสต์ (QA)",
        kind: "ref",
        ref: { table: "checklist_templates", labelColumn: "name", filter: { column: "role", value: "QA" } },
        help: "เลือก Template เช็คลิสต์ฝั่ง QA ที่สร้างไว้ใน Checklist Builder",
      },
      {
        key: "pressure_start_bar",
        label: "แรงดัน Start (bar)",
        kind: "number",
        min: 0,
        maxValue: 50,
        step: 0.1,
        help: "แรงดันต่อให้ปั๊มเริ่มทำงาน (Start) เช่น 5.0, 6.0, 8.0, 16.0",
      },
      {
        key: "pressure_stop_bar",
        label: "แรงดัน Stop (bar)",
        kind: "number",
        min: 0,
        maxValue: 50,
        step: 0.1,
        help: "แรงดันตัดเมื่อลมเต็มถัง (Stop) เช่น 7.0, 8.0, 10.0, 18.0",
      },
      {
        key: "is_pressure_concession",
        label: "อนุโลมเกณฑ์แรงดัน",
        kind: "bool",
        default: false,
        help: "ติ๊กเมื่อเป็นรุ่นที่อนุโลมให้ผ่านเป็น Concession ได้ (เช่น PP-1, ตระกูล TPP)",
      },
    ],
  },
  {
    slug: "defects",
    table: "defects",
    label: "อาการ / Defect",
    singular: "อาการ",
    description: "อาการกลางใช้ร่วมทุกชนิดปั๊ม ความซับซ้อน (ค่าแรง) และสาเหตุตั้งต้น · ความรุนแรงและ Disposition ที่ใช้ตัดสินอยู่ที่หัวข้อของ Checklist แต่ละชนิด",
    orderBy: "t.code",
    fields: [
      { key: "code", label: "รหัส", kind: "text", max: 32, generated: true, help: "ระบบออกให้อัตโนมัติ เช่น DEF00001" },
      { key: "name_th", label: "ชื่ออาการ (ไทย)", kind: "text", max: 200, required: true },
      { key: "name_en", label: "ชื่ออาการ (อังกฤษ)", kind: "text", max: 200, list: false },
      { key: "category", label: "หมวด", kind: "text", max: 64, help: "เช่น Leakage, Assembly Issue, Performance, Cosmetic, Electrical" },
      { key: "severity", label: "ความรุนแรงตั้งต้น", kind: "enum", required: true, default: "MINOR", help: "ใช้เป็นค่าเริ่มต้นตอนผูกอาการเข้าหัวข้อ Checklist — ค่าที่ใช้ตัดสินตั้งแยกตามชนิดปั๊มและชิ้นส่วน", options: [{ value: "MINOR", label: "Minor" }, { value: "MAJOR", label: "Major" }, { value: "CRITICAL", label: "Critical" }] },
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

/** Fields the user fills in (everything except database-generated ones). */
export const isEditable = (field: MasterField) => !field.generated;
export const isListed = (field: MasterField) => field.list !== false;
export const isSearchable = (field: MasterField) => field.kind === "text" && field.searchable !== false;
