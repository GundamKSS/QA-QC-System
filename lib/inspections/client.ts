"use client";

import type { InspectionQuota, InspectionTemplateData, StoredInspection } from "./store";
import type {
  EntryMode,
  InspectionRole,
  ItemAnswer,
  SerialEntryMode,
  UnitAction,
  UnitEvaluation,
} from "./types";

export type ClaimResponse =
  | {
      status: "claimed";
      inspection: StoredInspection;
      quota: InspectionQuota;
      resumed?: boolean;
    }
  | { status: "error"; message: string; inspectorName?: string; quota?: InspectionQuota };

export type SubmitResponse =
  | {
      status: "done";
      inspection: StoredInspection;
      evaluation: UnitEvaluation;
      qtyDone: number;
      qtyNeed: number;
    }
  | { status: "error"; message: string; missingItemIds?: number[] };

/**
 * Fetch checklist template, items, and defect catalogs for an inspection.
 */
export async function fetchInspectionTemplate(
  planId: number,
  role: InspectionRole = "QC",
): Promise<InspectionTemplateData> {
  const res = await fetch(`/api/inspections/template?planId=${planId}&role=${role}`, {
    credentials: "same-origin",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "ไม่สามารถโหลดแบบตรวจได้");
  }
  return res.json();
}

/**
 * Fetch live work-order quota and active inspector claims.
 */
export async function fetchWorkOrderQuota(workOrderId: string): Promise<InspectionQuota> {
  const res = await fetch(`/api/inspections/quota?workOrderId=${encodeURIComponent(workOrderId)}`, {
    credentials: "same-origin",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "ไม่สามารถโหลดข้อมูลโควตาได้");
  }
  return res.json();
}

/**
 * Claim and lock a unit for inspection (Pool-based claiming).
 */
export async function claimUnitApi(input: {
  planId: number;
  workOrderId: string;
  serialPump: string;
  serialMotor?: string | null;
  serialSupplier?: string | null;
  serialEntryMode?: SerialEntryMode;
  entryMode?: EntryMode;
  inspectionId?: string;
  role?: InspectionRole;
}): Promise<ClaimResponse> {
  const res = await fetch("/api/inspections/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(input),
  });
  return res.json();
}

/**
 * Cancel and release an in-progress unit claim, returning the quota to the pool.
 */
export async function cancelClaimApi(
  inspectionId: string,
): Promise<{ status: "cancelled" } | { status: "error"; message: string }> {
  const res = await fetch(`/api/inspections/${encodeURIComponent(inspectionId)}/cancel`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
  });
  return res.json();
}

/**
 * Submit completed inspection answers and evaluate machine outcome (BR-04).
 */
export async function submitInspectionApi(
  inspectionId: string,
  payload: {
    planId: number;
    workOrderId: string;
    role?: InspectionRole;
    answers: Record<number, ItemAnswer>;
    decision?: UnitAction | null;
  },
): Promise<SubmitResponse> {
  const res = await fetch(`/api/inspections/${encodeURIComponent(inspectionId)}/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(payload),
  });
  return res.json();
}
