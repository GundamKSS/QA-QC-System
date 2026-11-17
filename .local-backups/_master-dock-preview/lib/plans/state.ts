import type { OpenPlanFormValues } from "./form";
import type { OpenPlanField } from "./service";
import type { WorkOrderField } from "./work-orders";

/**
 * What `POST /api/plans` answers to the open-plan form. `at` re-keys the form after each refusal and
 * `values` are what was typed, so a refusal doesn't wipe it. `done` carries `redirectTo`.
 */
export type OpenPlanFormState =
  | { status: "idle" }
  | { status: "done" }
  | { status: "error"; message: string; fieldErrors?: Partial<Record<OpenPlanField, string>>; values: OpenPlanFormValues; at: number }
  /** BR-01: this Invoice/PO already has a live plan for the Model — link to it instead of opening another. */
  | { status: "duplicate"; planId: number; planNo: string; values: OpenPlanFormValues; at: number };

/** Result of the small plan-page forms (cancel, รอของ, Vendor, work-order buttons). `at` is unique per answer. */
export type PlanActionState = { status: "idle" } | { status: "error"; message: string; at: number } | { status: "done"; at: number };

/** The open-work-order form as typed, so an error doesn't wipe it (docs/16 §2 6b). */
export type WorkOrderFormValues = { calledDate: string; calledQty: string; remarks: string; assignees: string[] };

/** What `POST /api/plans/[id]/work-orders` answers to the form. `done` carries `redirectTo` the plan's work-order tab. */
export type WorkOrderFormState =
  | { status: "idle" }
  | { status: "done" }
  | {
      status: "error";
      message: string;
      fieldErrors?: Partial<Record<WorkOrderField, string>>;
      /** People who are no longer active QC Inspectors — the form names them from its list. */
      unavailable?: string[];
      values: WorkOrderFormValues;
      at: number;
    };
