import type { FieldError, OpenPlanField, OpenPlanInput } from "./service";

/** Raw form values, echoed back so a failed submit keeps what the user typed. */
export type OpenPlanFormValues = Record<OpenPlanField, string>;

export const OPEN_PLAN_FIELDS = [
  "docType",
  "docNo",
  "vendorId",
  "modelId",
  "lotQty",
  "receiptDate",
  "description",
  "manufacturer",
  "remarks",
  "invoiceDate",
  "docDate",
  "expectedSkuCount",
  "department",
  "docRemarks",
] as const satisfies readonly OpenPlanField[];

/** Whole numbers only ("350", " 1,200 "); anything else becomes NaN so the service reports "invalid". */
function count(raw: string): number | null {
  const value = raw.replace(/,/g, "").trim();
  if (!value) return null;
  return /^\d{1,9}$/.test(value) ? Number(value) : Number.NaN;
}

const id = (raw: string) => (/^\d{1,9}$/.test(raw.trim()) ? Number(raw.trim()) : null);

/** FormData → service input. Pure: `get` reads one field (null when absent). */
export function parseOpenPlanForm(get: (key: string) => string | null): { input: OpenPlanInput; values: OpenPlanFormValues } {
  const values = Object.fromEntries(OPEN_PLAN_FIELDS.map((field) => [field, get(field) ?? ""])) as OpenPlanFormValues;
  return {
    values,
    input: {
      docType: values.docType,
      docNo: values.docNo,
      vendorId: id(values.vendorId),
      modelId: id(values.modelId),
      lotQty: count(values.lotQty),
      receiptDate: values.receiptDate,
      description: values.description,
      manufacturer: values.manufacturer,
      remarks: values.remarks,
      invoiceDate: values.invoiceDate,
      docDate: values.docDate,
      expectedSkuCount: count(values.expectedSkuCount),
      department: values.department,
      docRemarks: values.docRemarks,
    },
  };
}

const LABELS: Record<OpenPlanField, string> = {
  docType: "แหล่งที่มา (Invoice / PO)",
  docNo: "เลขที่เอกสาร",
  vendorId: "Vendor / ผู้ผลิต",
  modelId: "Model",
  lotQty: "จำนวนตาม Invoice/PO",
  receiptDate: "วันที่รับสินค้าเข้า",
  description: "Description",
  manufacturer: "ผู้ผลิต",
  remarks: "หมายเหตุ",
  invoiceDate: "วันที่ Invoice",
  docDate: "วันที่ PO",
  expectedSkuCount: "จำนวน SKU ทั้งหมดใน Invoice",
  department: "แผนก",
  docRemarks: "หมายเหตุเอกสาร",
};

/** One Thai sentence per field problem, shown under the field. */
export function fieldErrorMessage(field: OpenPlanField, error: FieldError): string {
  const label = LABELS[field];
  switch (error) {
    case "required":
      return `กรุณากรอก${label}`;
    case "too_long":
      return `${label} ยาวเกินไป`;
    case "inactive":
      return `${label} นี้ถูกปิดใช้งานแล้ว`;
    case "not_found":
      return `ไม่พบ${label}ที่เลือก`;
    case "invalid":
      if (field === "lotQty") return "จำนวนต้องเป็นจำนวนเต็ม 1 ขึ้นไป";
      if (field === "expectedSkuCount") return "จำนวน SKU ต้องเป็นจำนวนเต็ม 1 ขึ้นไป";
      if (field === "department") return "แผนกต้องเป็น 408 หรือ 409";
      return `${label} ไม่ถูกต้อง`;
  }
}
