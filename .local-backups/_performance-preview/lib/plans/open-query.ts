/** The address of `/plans/new`, or of `GET /api/plans/options`, as a page's `searchParams` gives it. */
export type OpenPlanQuery = Record<string, string | string[] | undefined>;

export type OpenPlanPrefill = { docType: "INVOICE" | "PO"; vendorId: string; docNo: string };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

/** The plan that was just opened (`?opened=<id>`), or null when the value can't be a plan id. */
export function parseOpenedId(query: OpenPlanQuery): number | null {
  return /^\d{1,12}$/.test(one(query.opened)) ? Number(one(query.opened)) : null;
}

/**
 * "เปิด Model ถัดไปใน Invoice นี้" (K4) comes back with the document filled in
 * (?docType=&vendorId=&docNo=). `hasDocType` tells whether the address named the type: when it didn't, the form
 * starts from the type of the plan that was just opened.
 */
export function parseOpenPlanPrefill(query: OpenPlanQuery): { prefill: OpenPlanPrefill; hasDocType: boolean } {
  return {
    prefill: {
      docType: one(query.docType) === "PO" ? "PO" : "INVOICE",
      vendorId: /^\d{1,9}$/.test(one(query.vendorId)) ? one(query.vendorId) : "",
      docNo: one(query.docNo).slice(0, 64),
    },
    hasDocType: one(query.docType) !== "",
  };
}
