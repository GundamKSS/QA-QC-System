import { describe, expect, it } from "vitest";
import { fieldErrorMessage, OPEN_PLAN_FIELDS, parseOpenPlanForm } from "@/lib/plans/form";

const formOf = (fields: Record<string, string>) => (key: string) => fields[key] ?? null;

describe("parseOpenPlanForm", () => {
  it("turns form strings into service input and echoes every field back", () => {
    const { input, values } = parseOpenPlanForm(formOf({ docType: "INVOICE", docNo: "INV-A", vendorId: "1", modelId: "2", lotQty: " 1,200 ", expectedSkuCount: "3", invoiceDate: "2026-10-01" }));
    expect(input).toMatchObject({ docType: "INVOICE", docNo: "INV-A", vendorId: 1, modelId: 2, lotQty: 1200, expectedSkuCount: 3, invoiceDate: "2026-10-01" });
    expect(Object.keys(values).sort()).toEqual([...OPEN_PLAN_FIELDS].sort());
    expect(values.lotQty).toBe(" 1,200 ");
    expect(values.remarks).toBe("");
  });

  it("keeps blanks as null and garbage as NaN so the service can tell them apart", () => {
    const { input } = parseOpenPlanForm(formOf({ vendorId: "", modelId: "x", lotQty: "12.5", expectedSkuCount: "" }));
    expect(input.vendorId).toBeNull();
    expect(input.modelId).toBeNull();
    expect(input.lotQty).toBeNaN();
    expect(input.expectedSkuCount).toBeNull();
  });
});

describe("fieldErrorMessage", () => {
  it("speaks Thai with the field name", () => {
    expect(fieldErrorMessage("docNo", "required")).toBe("กรุณากรอกเลขที่เอกสาร");
    expect(fieldErrorMessage("lotQty", "invalid")).toBe("จำนวนต้องเป็นจำนวนเต็ม 1 ขึ้นไป");
    expect(fieldErrorMessage("modelId", "inactive")).toBe("Model นี้ถูกปิดใช้งานแล้ว");
    expect(fieldErrorMessage("department", "invalid")).toBe("แผนกต้องเป็น 408 หรือ 409");
  });
});
