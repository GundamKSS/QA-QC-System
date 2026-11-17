import "server-only";
import { thaiToday } from "./rules";
import { getPlanStore } from "./runtime";
import type { OpenOptions, PlanDetail, QcSettings } from "./store";

/**
 * What the open-plan form needs for `GET /api/plans/options`: the vendors and models to pick from, the QC percent
 * and deadline days in force, today's Thai date, and the plan that was just opened (for the "opened" banner). The
 * browser side (components/plans) imports only the types from this file, never a value — it reaches the database.
 */

/** The part of a freshly opened plan the banner shows and the "next model" link carries. */
export type OpenedPlan = {
  id: number;
  planNo: string;
  modelCode: string;
  qcRequired: number;
  lotQty: number;
  docType: "INVOICE" | "PO";
  vendorId: number | null;
  docNo: string;
};

export type OpenPlanPayload = {
  options: OpenOptions;
  settings: QcSettings;
  /** YYYY-MM-DD in Thai time, the date the live QC deadline preview counts from. */
  today: string;
  /** Null when no `opened` was asked for, or no such plan exists. */
  opened: OpenedPlan | null;
};

const toOpened = (plan: PlanDetail): OpenedPlan => ({
  id: plan.id,
  planNo: plan.planNo,
  modelCode: plan.model.code,
  qcRequired: plan.qcRequired,
  lotQty: plan.lotQty,
  docType: plan.doc.docType,
  vendorId: plan.doc.vendorId,
  docNo: plan.doc.docNo,
});

/** Throws the database's own errors; the route turns them into a 503. */
export async function loadOpenPlanData(openedId: number | null): Promise<OpenPlanPayload> {
  const store = getPlanStore();
  const now = new Date();
  const options = await store.listOpenOptions();
  const settings = await store.qcSettings(now);
  const opened = openedId !== null ? await store.getPlan(openedId) : null;
  return { options, settings, today: thaiToday(now), opened: opened ? toOpened(opened) : null };
}
