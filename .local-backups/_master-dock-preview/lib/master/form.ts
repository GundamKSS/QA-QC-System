import { isEditable, type MasterDef, type MasterField } from "./registry";

export type MasterValue = string | number | boolean | null;
export type MasterValues = Record<string, MasterValue>;
export type FormResult = { ok: true; values: MasterValues } | { ok: false; errors: Record<string, string>; values: MasterValues };

/**
 * What `POST /api/master/[table]` and `PATCH …/[id]` answer to the form. `at` re-keys the form after
 * each refusal; `values` are what was typed, so a refusal doesn't wipe the form. `done` carries `redirectTo`.
 */
export type MasterFormState =
  | { status: "idle" }
  | { status: "done" }
  | { status: "error"; message: string; fieldErrors?: Record<string, string>; values?: MasterValues; at: number };

/** What `POST …/[id]/active` answers to the enable/disable button. */
export type ToggleState = { status: "idle" } | { status: "error"; message: string } | { status: "done" };

const ERR = {
  required: "กรุณากรอกข้อมูล",
  number: "ต้องเป็นตัวเลขจำนวนเต็ม",
  choice: "เลือกค่าที่กำหนด",
  ref: "เลือกจากรายการ",
};

const text = (raw: string | null) => (raw ?? "").trim();

function parseField(field: MasterField, raw: string | null): { value: MasterValue; error?: string } {
  const value = text(raw);
  switch (field.kind) {
    case "bool":
      // A checkbox posts "on"/"1"/"true" when ticked and nothing when not.
      return { value: ["on", "1", "true"].includes(value.toLowerCase()) };
    case "text": {
      if (!value) return field.required ? { value: null, error: ERR.required } : { value: null };
      if (value.length > field.max) return { value, error: `ยาวเกิน ${field.max} ตัวอักษร` };
      return { value };
    }
    case "number": {
      if (!value) return field.required ? { value: null, error: ERR.required } : { value: null };
      if (!/^-?\d+$/.test(value)) return { value, error: ERR.number };
      const parsed = Number(value);
      if (parsed < field.min || parsed > field.maxValue) return { value: parsed, error: `ต้องอยู่ระหว่าง ${field.min} ถึง ${field.maxValue}` };
      return { value: parsed };
    }
    case "enum": {
      if (!value) return field.required ? { value: null, error: ERR.required } : { value: null };
      if (!field.options.some((option) => option.value === value)) return { value, error: ERR.choice };
      return { value };
    }
    case "ref": {
      if (!value) return field.required ? { value: null, error: ERR.required } : { value: null };
      if (!/^\d{1,9}$/.test(value)) return { value, error: ERR.ref };
      return { value: Number(value) };
    }
  }
}

/** Validates a submitted master form against its definition. Pure: takes a getter, not FormData. */
export function parseMasterForm(def: MasterDef, get: (key: string) => string | null): FormResult {
  const values: MasterValues = {};
  const errors: Record<string, string> = {};
  for (const field of def.fields.filter(isEditable)) {
    const { value, error } = parseField(field, get(field.key));
    values[field.key] = value;
    if (error) errors[field.key] = error;
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors, values } : { ok: true, values };
}

/** Starting values for the "new" form. */
export function defaultValues(def: MasterDef): MasterValues {
  const values: MasterValues = {};
  for (const field of def.fields) {
    values[field.key] = field.kind === "bool" ? field.default : field.kind === "number" ? (field.default ?? null) : field.kind === "enum" ? (field.default ?? null) : null;
  }
  return values;
}

/** Display text for a stored value (list cells and the audit trail). */
export function displayValue(field: MasterField, value: MasterValue | undefined, refLabel?: string | null): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (field.kind) {
    case "bool":
      return value ? "ใช่" : "ไม่ใช่";
    case "enum":
      return field.options.find((option) => option.value === value)?.label ?? String(value);
    case "ref":
      return refLabel ?? String(value);
    default:
      return String(value);
  }
}
