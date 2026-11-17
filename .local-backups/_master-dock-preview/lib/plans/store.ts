import {
  callInError, canOpenWorkOrder, DEADLINE_SOON_DAYS, DEFAULT_QC_DEADLINE_DAYS, DEFAULT_QC_PERCENT, failsWhenSettled, formatPlanNo, formatWorkOrderNo, lotSettled, minCallIn,
  newSerials, OPEN_WORK_ORDER_STATUSES, planWorkOrder, takesCallInDate, thaiToday, workOrderBlock, type CallInError, type PlanSort, type PlanStatus, type WorkOrderStatus,
  type WorkOrderType,
} from "./rules";

export type DocType = "INVOICE" | "PO";
export type Origin = "IMPORTED" | "DOMESTIC";

/** Invoice → imported pump, PO → own factory (docs/03 §0). */
export const originOf = (docType: DocType): Origin => (docType === "INVOICE" ? "IMPORTED" : "DOMESTIC");

/** Unique key of a receipt document (BR-01; the vendor left the key on 23 Oct 2026 — db/013). */
export type ReceiptDocKey = { docType: DocType; docNoNormalized: string };

/** The header the first plan of an Invoice/PO fills in; later plans show it read-only. */
export type ReceiptDocHeader = {
  invoiceDate: string | null;
  docDate: string | null;
  expectedSkuCount: number | null;
  department: string | null;
  qcDeadline: string | null;
  remarks: string | null;
};

/**
 * The vendor belongs to the document, so every plan and work order of it shares one. It may be left empty
 * when the plan is opened and filled in or changed later, once the warehouse tells the QC Head (user 23 Oct 2026).
 */
export type ReceiptDoc = ReceiptDocKey &
  ReceiptDocHeader & { id: number; docNo: string; vendorId: number | null; vendorName: string | null; origin: Origin; planCount: number };

export type ModelInfo = {
  id: number;
  code: string;
  description: string | null;
  brandName: string;
  origin: Origin;
  isActive: boolean;
  /** Shown read-only on the form (FR-PLAN-03). */
  pumpType: string | null;
  qcChecklist: string | null;
  qaChecklist: string | null;
};
export type VendorInfo = { id: number; name: string; isActive: boolean };

/** Everything the store writes for a new plan — already validated and computed by the service. */
export type NewPlan = {
  /** vendorId only fills a new document; an existing one keeps its own (change it with setDocVendor). */
  doc: ReceiptDocKey & { docNo: string; vendorId: number | null; header: ReceiptDocHeader };
  modelId: number;
  description: string | null;
  manufacturer: string | null;
  lotQty: number;
  receiptDate: string | null;
  remarks: string | null;
  qcPercent: number;
  qcRequired: number;
  /** YYMM in Thai time — the run number restarts every month (BR-10). */
  period: string;
  openedBy: string;
};

export type OpenPlanResult =
  | { kind: "opened"; planId: number; planNo: string; headerReused: boolean }
  | { kind: "duplicate"; planId: number; planNo: string };

export type PlanDetail = {
  id: number;
  planNo: string;
  status: PlanStatus;
  doc: ReceiptDoc;
  model: ModelInfo;
  description: string | null;
  manufacturer: string | null;
  lotQty: number;
  lotCalledTotal: number;
  qcDoneTotal: number;
  qcPercent: number;
  qcRequired: number;
  receiptDate: string | null;
  remarks: string | null;
  waitingGoods: boolean;
  openedAt: Date;
  openedBy: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  /** FR-PLAN-15: slot 1 of the first work order (docs/16 W8); display name. */
  responsibleQc: string | null;
};

/** An active user with the QC Inspector role, with the work orders they still hold (docs/16 §4.1). */
export type Inspector = { id: string; code: string; name: string; openWorkOrders: number };

export type WorkOrderAssignee = { slot: number; userId: string; name: string; code: string };

/** One call-in of a plan (docs/13, docs/16): <plan no>-<seq>, Need and type picked by the system. */
export type WorkOrder = {
  id: string;
  planId: number;
  seq: number;
  woNo: string;
  type: WorkOrderType;
  calledQty: number;
  calledDate: string;
  qtyNeed: number;
  qtyDone: number;
  status: WorkOrderStatus;
  remarks: string | null;
  cancelReason: string | null;
  assignees: WorkOrderAssignee[];
  createdAt: Date;
};

/** done = ส่งแล้ว / ปิดแล้ว · cancelled = ยกเลิก (H2) · all = both. */
export type JobHistoryFilter = { userId: string | null; kind: "all" | "done" | "cancelled"; fromDate: string | null; page: number; pageSize: number };

/** A work order as "งานของฉัน" shows it, with what the inspector needs to recognise the lot. */
export type JobCard = WorkOrder & { planNo: string; modelCode: string; description: string | null; docType: DocType; docNo: string; vendorName: string | null };

/** Validated by the service; the store re-checks what depends on the locked plan (status, lot left, people). */
export type NewWorkOrder = { planId: number; calledQty: number; calledDate: string; remarks: string | null; assigneeIds: readonly string[]; by: string };

export type OpenWorkOrderResult =
  | { kind: "opened"; id: string; woNo: string; seq: number; type: WorkOrderType; need: number }
  | { kind: "plan_not_found" }
  | { kind: "plan_closed"; status: PlanStatus }
  /** `minimum` = Need at the moment of saving (docs/17 §1.2). */
  | { kind: "call_in"; error: CallInError; remaining: number; minimum: number }
  /** docs/17 §1.4: the plan already has a work order called in on this date. */
  | { kind: "same_day"; woNo: string }
  /** Someone was deactivated or lost the QC Inspector role since the page loaded. */
  | { kind: "assignees_unavailable"; userIds: string[] };

export type SetAssigneesResult =
  | { kind: "saved"; planId: number; woNo: string; before: string[] }
  | { kind: "not_found" }
  | { kind: "locked" }
  | { kind: "assignees_unavailable"; userIds: string[] };

export type SetDocVendorResult =
  | { kind: "saved"; docId: number; docNo: string; before: number | null; planNos: string[] }
  | { kind: "not_found" }
  | { kind: "plan_cancelled" };

export type CancelWorkOrderResult =
  | { kind: "cancelled"; planId: number; woNo: string; calledQty: number }
  | { kind: "not_found" }
  | { kind: "locked"; block: "status" | "has_results" };

/** One row of the plan list (docs/15 §2). */
export type PlanListRow = {
  id: number;
  planNo: string;
  status: PlanStatus;
  docType: DocType;
  docNo: string;
  vendorName: string | null;
  modelCode: string;
  pumpType: string | null;
  lotQty: number;
  qcDoneTotal: number;
  qcRequired: number;
  /** Invoice only (BR-11); null for PO. */
  qcDeadline: string | null;
  waitingGoods: boolean;
  openedAt: Date;
};

export type PlanListFilter = {
  /** Plan no / Invoice-PO no / Model code / Vendor name, contains. */
  q?: string;
  /** null = every status except CANCELLED (P3). */
  statuses?: readonly PlanStatus[] | null;
  /** "none" = documents whose vendor isn't filled in yet. */
  vendorId?: number | "none" | null;
  /** A `value` from planFilterOptions().pumpTypes. */
  pumpType?: string | null;
  /** Opened on these Thai dates, inclusive (P5). */
  from?: string | null;
  to?: string | null;
  sort?: PlanSort;
  page: number;
  pageSize: number;
};

export type PlanFilterOptions = { vendors: { id: number; name: string }[]; pumpTypes: { value: string; label: string }[] };

/** plan_status_history, oldest first; `by` is a display name. */
export type PlanHistoryEntry = { from: PlanStatus | null; to: PlanStatus; at: Date; by: string | null; reason: string | null };

export type QcSettings = { qcPercent: number; deadlineDays: number };

/**
 * Home dashboard numbers. "Live" = not CANCELLED / COMPLETED. Deadlines are the Invoice 90-day
 * date (BR-11) compared with `today` (Thai date): overdue = before today, soon = today … today + 14.
 */
export type PlanSummary = {
  live: number;
  notStarted: number;
  completed: number;
  waitingGoods: number;
  qcDone: number;
  qcRequired: number;
  deadlineSoon: number;
  overdue: number;
};

/** Live plans of one Invoice/PO — shown when the document already exists, and used to warn about a duplicate Model. */
export type DocPlan = { id: number; planNo: string; modelId: number; modelCode: string };

/** Choices for the open-plan form: active rows only, sorted for the dropdowns. */
export type OpenOptions = { vendors: VendorInfo[]; models: ModelInfo[] };

/** Where plans live. SQL Server in production (db/plans.ts), memory in tests and DB-less dev. */
export interface PlanStore {
  /** The % in force at `at` (qc_sampling_rates) and the Invoice deadline days (settings). */
  qcSettings(at: Date): Promise<QcSettings>;
  findVendor(id: number): Promise<VendorInfo | null>;
  findModel(id: number): Promise<ModelInfo | null>;
  findReceiptDoc(key: ReceiptDocKey): Promise<ReceiptDoc | null>;
  docPlans(docId: number): Promise<DocPlan[]>;
  listOpenOptions(): Promise<OpenOptions>;
  /**
   * One transaction: reuse or create the receipt document, refuse a second live plan for the
   * same (document, model), take the next run number of `period`, insert the plan + its first
   * status-history row.
   */
  openPlan(plan: NewPlan): Promise<OpenPlanResult>;
  getPlan(id: number): Promise<PlanDetail | null>;
  listPlans(filter: PlanListFilter): Promise<{ rows: PlanListRow[]; total: number }>;
  planFilterOptions(): Promise<PlanFilterOptions>;
  planHistory(id: number): Promise<PlanHistoryEntry[]>;
  /** Counts for the home dashboard; `today` is YYYY-MM-DD in Thai time. */
  planSummary(today: string): Promise<PlanSummary>;
  /**
   * One transaction: CANCELLED only if the plan is still in `from` (someone may have changed it
   * since the page loaded), history row, and its open work orders cancelled too (BR-13).
   * false = the plan wasn't in `from` any more.
   */
  cancelPlan(id: number, change: { from: PlanStatus; by: string; reason: string }): Promise<boolean>;
  /** FR-PLAN-17. false = no such live plan (cancelled / completed). */
  setWaitingGoods(id: number, value: boolean, by: string): Promise<boolean>;
  /**
   * Fill in or change (null = clear) the vendor of a plan's receipt document — any time, unless the plan
   * is cancelled. Every plan and work order of that document follows. The vendor is checked by the service.
   */
  setDocVendor(planId: number, change: { vendorId: number | null; by: string }): Promise<SetDocVendorResult>;

  /** Active QC Inspectors (W2) with their open work-order count, by name. */
  listInspectors(): Promise<Inspector[]>;
  /**
   * One transaction with the plan locked: next seq, one work order per call-in date, call-in within
   * the lot and ≥ Need (callInError), Need and type from planWorkOrder, people still active QC, then the
   * work order + assignees, the plan's called total, OPEN → ASSIGNED with history, the main responsible
   * QC (W8), and — when this call-in completes the lot — untouched work orders to FAILED (docs/17 §1.5).
   */
  openWorkOrder(input: NewWorkOrder): Promise<OpenWorkOrderResult>;
  workOrdersOf(planId: number): Promise<WorkOrder[]>;
  getWorkOrder(id: string): Promise<WorkOrder | null>;
  /** "งานของฉัน": open ones first, oldest call-in first. userId null = everyone's (QC Head, W6).
   * activeOnly returns all IN_PROGRESS / RETURNED work on live plans, without the regular list's 200-row cap. */
  jobs(userId: string | null, options?: { activeOnly?: boolean }): Promise<JobCard[]>;
  /** "ประวัติ" (docs/18): work orders no longer in anyone's hands — newest call-in first. userId null = everyone's. */
  jobHistory(filter: JobHistoryFilter): Promise<{ rows: JobCard[]; total: number }>;
  /** W4: replace the people (still 2–5, validated by the service) while the work order is open. */
  setAssignees(id: string, change: { assigneeIds: readonly string[]; by: string }): Promise<SetAssigneesResult>;
  /** W4: cancel with a reason before any result; the called quantity returns to the lot, ASSIGNED → OPEN when none is left. */
  cancelWorkOrder(id: string, change: { by: string; reason: string }): Promise<CancelWorkOrderResult>;
}

type StoredPlan = Omit<PlanDetail, "doc" | "model" | "openedBy" | "responsibleQc"> & { docId: number; modelId: number; openedBy: string; responsibleQcId: string | null };
type StoredWorkOrder = Omit<WorkOrder, "assignees"> & { assigneeIds: string[] };
type SeedInspector = { id: string; code: string; name: string; isActive: boolean };
type HistoryRow = { planId: number; from: PlanStatus | null; to: PlanStatus; by: string; at: Date; reason: string | null };
type StoredDoc = Omit<ReceiptDoc, "vendorName" | "planCount">;

/** In-memory store for tests and DB-less dev. Operations are synchronous inside, so they are atomic. */
export function createMemoryPlanStore(
  seed: { vendors?: VendorInfo[]; models?: ModelInfo[]; inspectors?: SeedInspector[]; qcPercent?: number; deadlineDays?: number } = {},
) {
  const vendors = new Map((seed.vendors ?? []).map((vendor) => [vendor.id, vendor]));
  const inspectors = new Map((seed.inspectors ?? []).map((inspector) => [inspector.id, { ...inspector }]));
  const workOrders: StoredWorkOrder[] = [];
  const models = new Map((seed.models ?? []).map((model) => [model.id, model]));
  const docs: StoredDoc[] = [];
  const plans: StoredPlan[] = [];
  const counters = new Map<string, number>();
  const history: HistoryRow[] = [];
  const settings: QcSettings = { qcPercent: seed.qcPercent ?? DEFAULT_QC_PERCENT, deadlineDays: seed.deadlineDays ?? DEFAULT_QC_DEADLINE_DAYS };

  const sameKey = (doc: StoredDoc, key: ReceiptDocKey) => doc.docType === key.docType && doc.docNoNormalized === key.docNoNormalized;
  const vendorName = (id: number | null) => (id === null ? null : (vendors.get(id)?.name ?? null));
  const toDoc = (doc: StoredDoc): ReceiptDoc => ({
    ...doc,
    vendorName: vendorName(doc.vendorId),
    planCount: plans.filter((plan) => plan.docId === doc.id && plan.status !== "CANCELLED").length,
  });

  const serials = new Map<number, Set<string>>();
  const serialsOf = (planId: number) => serials.get(planId) ?? serials.set(planId, new Set()).get(planId)!;
  const settle = (plan: StoredPlan) => {
    if (!lotSettled(plan)) return;
    for (const wo of workOrders) if (wo.planId === plan.id && failsWhenSettled(wo)) wo.status = "FAILED";
  };

  const openCount = (userId: string) => workOrders.filter((wo) => OPEN_WORK_ORDER_STATUSES.includes(wo.status) && wo.assigneeIds.includes(userId)).length;
  const unavailable = (ids: readonly string[]) => ids.filter((id) => !inspectors.get(id)?.isActive);
  const toWorkOrder = ({ assigneeIds, ...wo }: StoredWorkOrder): WorkOrder => ({
    ...wo,
    assignees: assigneeIds.map((userId, index) => ({ slot: index + 1, userId, name: inspectors.get(userId)?.name ?? userId, code: inspectors.get(userId)?.code ?? "" })),
  });
  const byJobOrder = (a: StoredWorkOrder, b: StoredWorkOrder) =>
    Number(!OPEN_WORK_ORDER_STATUSES.includes(a.status)) - Number(!OPEN_WORK_ORDER_STATUSES.includes(b.status)) ||
    a.calledDate.localeCompare(b.calledDate) ||
    a.seq - b.seq;

  const store: PlanStore & {
    history: typeof history;
    setQcPercent(percent: number): void;
    /** Tests: deactivate someone, or record results on a work order. */
    setInspectorActive(id: string, active: boolean): void;
    /** Submitted units by Serial; returns how many were new to the plan (True, docs/17 §1.3). */
    recordQcDone(workOrderId: string, serials: readonly string[]): number;
    /** Tests: move a work order to SUBMITTED / CLOSED without the inspection module. */
    setStatus(workOrderId: string, status: WorkOrderStatus): void;
  } = {
    history,
    setStatus(workOrderId, status) {
      const wo = workOrders.find((item) => item.id === workOrderId);
      if (wo) wo.status = status;
    },
    setQcPercent(percent) {
      settings.qcPercent = percent;
    },
    setInspectorActive(id, active) {
      const inspector = inspectors.get(id);
      if (inspector) inspector.isActive = active;
    },
    recordQcDone(workOrderId, serials) {
      const wo = workOrders.find((item) => item.id === workOrderId);
      const plan = wo && plans.find((item) => item.id === wo.planId);
      if (!wo || !plan) return 0;
      const seen = serialsOf(plan.id);
      const fresh = newSerials(seen, serials);
      for (const serial of fresh) seen.add(serial);
      wo.qtyDone += fresh.length;
      plan.qcDoneTotal += fresh.length;
      settle(plan);
      return fresh.length;
    },
    async qcSettings() {
      return { ...settings };
    },
    async findVendor(id) {
      return vendors.get(id) ?? null;
    },
    async findModel(id) {
      return models.get(id) ?? null;
    },
    async findReceiptDoc(key) {
      const doc = docs.find((item) => sameKey(item, key));
      return doc ? toDoc(doc) : null;
    },
    async docPlans(docId) {
      return plans
        .filter((plan) => plan.docId === docId && plan.status !== "CANCELLED")
        .map((plan) => ({ id: plan.id, planNo: plan.planNo, modelId: plan.modelId, modelCode: models.get(plan.modelId)?.code ?? "" }));
    },
    async listOpenOptions() {
      const byName = (a: VendorInfo, b: VendorInfo) => a.name.localeCompare(b.name);
      return {
        vendors: [...vendors.values()].filter((vendor) => vendor.isActive).sort(byName),
        models: [...models.values()].filter((model) => model.isActive).sort((a, b) => a.code.localeCompare(b.code)),
      };
    },
    async openPlan(input) {
      let doc = docs.find((item) => sameKey(item, input.doc));
      const headerReused = Boolean(doc);
      const duplicate = doc && plans.find((plan) => plan.docId === doc!.id && plan.modelId === input.modelId && plan.status !== "CANCELLED");
      if (duplicate) return { kind: "duplicate", planId: duplicate.id, planNo: duplicate.planNo };
      if (!doc) {
        const { header, ...key } = input.doc;
        doc = { id: docs.length + 1, ...key, ...header, origin: originOf(key.docType) };
        docs.push(doc);
      }
      const runNo = (counters.get(input.period) ?? 0) + 1;
      const planNo = formatPlanNo(input.period, runNo);
      counters.set(input.period, runNo);
      const plan: StoredPlan = {
        id: plans.length + 1,
        planNo,
        status: "OPEN",
        docId: doc.id,
        modelId: input.modelId,
        description: input.description,
        manufacturer: input.manufacturer,
        lotQty: input.lotQty,
        lotCalledTotal: 0,
        qcDoneTotal: 0,
        qcPercent: input.qcPercent,
        qcRequired: input.qcRequired,
        receiptDate: input.receiptDate,
        remarks: input.remarks,
        waitingGoods: false,
        openedAt: new Date(),
        openedBy: input.openedBy,
        cancelledAt: null,
        cancelReason: null,
        responsibleQcId: null,
      };
      plans.push(plan);
      history.push({ planId: plan.id, from: null, to: "OPEN", by: input.openedBy, at: plan.openedAt, reason: null });
      return { kind: "opened", planId: plan.id, planNo, headerReused };
    },
    async getPlan(id) {
      const plan = plans.find((item) => item.id === id);
      if (!plan) return null;
      const { docId, modelId, responsibleQcId, ...rest } = plan;
      return {
        ...rest,
        doc: toDoc(docs.find((doc) => doc.id === docId)!),
        model: models.get(modelId)!,
        openedBy: plan.openedBy,
        responsibleQc: responsibleQcId ? (inspectors.get(responsibleQcId)?.name ?? responsibleQcId) : null,
      };
    },
    async listPlans(filter) {
      const term = filter.q?.trim().toLowerCase() ?? "";
      const rows = plans
        .filter((plan) => {
          if (!filter.vendorId) return true;
          const vendorId = docs.find((doc) => doc.id === plan.docId)?.vendorId ?? null;
          return filter.vendorId === "none" ? vendorId === null : vendorId === filter.vendorId;
        })
        .map((plan): PlanListRow => {
          const doc = docs.find((item) => item.id === plan.docId)!;
          const model = models.get(plan.modelId)!;
          return {
            id: plan.id, planNo: plan.planNo, status: plan.status, docType: doc.docType, docNo: doc.docNo,
            vendorName: vendorName(doc.vendorId), modelCode: model.code, pumpType: model.pumpType, lotQty: plan.lotQty,
            qcDoneTotal: plan.qcDoneTotal, qcRequired: plan.qcRequired, qcDeadline: doc.qcDeadline, waitingGoods: plan.waitingGoods,
            openedAt: plan.openedAt,
          };
        })
        .filter((row) => (filter.statuses ? filter.statuses.includes(row.status) : row.status !== "CANCELLED"))
        .filter((row) => !term || [row.planNo, row.docNo, row.modelCode, row.vendorName ?? ""].some((value) => value.toLowerCase().includes(term)))
        .filter((row) => !filter.pumpType || row.pumpType === filter.pumpType)
        .filter((row) => {
          const day = thaiToday(row.openedAt);
          return (!filter.from || day >= filter.from) && (!filter.to || day <= filter.to);
        });
      const byOpened = (a: PlanListRow, b: PlanListRow) => b.openedAt.getTime() - a.openedAt.getTime() || b.id - a.id;
      rows.sort(
        filter.sort === "plan_no"
          ? (a, b) => a.planNo.localeCompare(b.planNo)
          : filter.sort === "deadline"
            ? (a, b) => (a.qcDeadline ?? "9999").localeCompare(b.qcDeadline ?? "9999") || byOpened(a, b)
            : byOpened,
      );
      const start = (filter.page - 1) * filter.pageSize;
      return { rows: rows.slice(start, start + filter.pageSize), total: rows.length };
    },
    async planFilterOptions() {
      const pumpTypes = [...new Set([...models.values()].map((model) => model.pumpType).filter((name): name is string => Boolean(name)))].sort();
      return {
        vendors: [...vendors.values()].map(({ id, name }) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
        pumpTypes: pumpTypes.map((name) => ({ value: name, label: name })),
      };
    },
    async planHistory(id) {
      return history.filter((row) => row.planId === id).map(({ from, to, at, by, reason }) => ({ from, to, at, by, reason }));
    },
    async planSummary(today) {
      const soon = new Date(Date.parse(today) + DEADLINE_SOON_DAYS * 86_400_000).toISOString().slice(0, 10);
      const summary: PlanSummary = { live: 0, notStarted: 0, completed: 0, waitingGoods: 0, qcDone: 0, qcRequired: 0, deadlineSoon: 0, overdue: 0 };
      for (const plan of plans) {
        if (plan.status === "COMPLETED") summary.completed++;
        if (plan.status === "CANCELLED" || plan.status === "COMPLETED") continue;
        summary.live++;
        if (plan.qcDoneTotal === 0) summary.notStarted++;
        if (plan.waitingGoods) summary.waitingGoods++;
        summary.qcDone += plan.qcDoneTotal;
        summary.qcRequired += plan.qcRequired;
        const deadline = docs.find((doc) => doc.id === plan.docId)?.qcDeadline;
        if (!deadline) continue;
        if (deadline < today) summary.overdue++;
        else if (deadline <= soon) summary.deadlineSoon++;
      }
      return summary;
    },
    async cancelPlan(id, change) {
      const plan = plans.find((item) => item.id === id);
      if (!plan || plan.status !== change.from) return false;
      plan.status = "CANCELLED";
      plan.cancelledAt = new Date();
      plan.cancelReason = change.reason;
      for (const wo of workOrders) {
        if (wo.planId === id && OPEN_WORK_ORDER_STATUSES.concat("SUBMITTED").includes(wo.status)) {
          wo.status = "CANCELLED";
          wo.cancelReason = change.reason;
        }
      }
      history.push({ planId: id, from: change.from, to: "CANCELLED", by: change.by, at: plan.cancelledAt, reason: change.reason });
      return true;
    },
    async setWaitingGoods(id, value) {
      const plan = plans.find((item) => item.id === id);
      if (!plan || plan.status === "CANCELLED" || plan.status === "COMPLETED") return false;
      plan.waitingGoods = value;
      return true;
    },
    async setDocVendor(planId, change) {
      const plan = plans.find((item) => item.id === planId);
      if (!plan) return { kind: "not_found" };
      if (plan.status === "CANCELLED") return { kind: "plan_cancelled" };
      const doc = docs.find((item) => item.id === plan.docId)!;
      const before = doc.vendorId;
      doc.vendorId = change.vendorId;
      const planNos = plans.filter((item) => item.docId === doc.id && item.status !== "CANCELLED").map((item) => item.planNo);
      return { kind: "saved", docId: doc.id, docNo: doc.docNo, before, planNos };
    },
    async listInspectors() {
      return [...inspectors.values()]
        .filter((inspector) => inspector.isActive)
        .map(({ id, code, name }) => ({ id, code, name, openWorkOrders: openCount(id) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async openWorkOrder(input) {
      const plan = plans.find((item) => item.id === input.planId);
      if (!plan) return { kind: "plan_not_found" };
      if (!canOpenWorkOrder(plan.status)) return { kind: "plan_closed", status: plan.status };
      const sameDay = workOrders.find((wo) => wo.planId === plan.id && takesCallInDate(wo.status) && wo.calledDate === input.calledDate);
      if (sameDay) return { kind: "same_day", woNo: sameDay.woNo };
      const lot = { lotQty: plan.lotQty, lotCalledTotal: plan.lotCalledTotal, qcRequired: plan.qcRequired, qcDoneBefore: plan.qcDoneTotal };
      const error = callInError({ ...lot, calledQty: input.calledQty });
      if (error) return { kind: "call_in", error, remaining: plan.lotQty - plan.lotCalledTotal, minimum: minCallIn(lot) };
      const missing = unavailable(input.assigneeIds);
      if (missing.length > 0) return { kind: "assignees_unavailable", userIds: missing };

      const { type, need } = planWorkOrder({ calledQty: input.calledQty, qcRequired: plan.qcRequired, qcDoneBefore: plan.qcDoneTotal });
      const seq = Math.max(0, ...workOrders.filter((wo) => wo.planId === plan.id).map((wo) => wo.seq)) + 1;
      const wo: StoredWorkOrder = {
        id: `wo-${workOrders.length + 1}`,
        planId: plan.id,
        seq,
        woNo: formatWorkOrderNo(plan.planNo, seq),
        type,
        calledQty: input.calledQty,
        calledDate: input.calledDate,
        qtyNeed: need,
        qtyDone: 0,
        status: "IN_PROGRESS",
        remarks: input.remarks,
        cancelReason: null,
        assigneeIds: [...input.assigneeIds],
        createdAt: new Date(),
      };
      workOrders.push(wo);
      plan.lotCalledTotal += input.calledQty;
      plan.responsibleQcId ??= input.assigneeIds[0];
      if (plan.status === "OPEN") {
        plan.status = "ASSIGNED";
        history.push({ planId: plan.id, from: "OPEN", to: "ASSIGNED", by: input.by, at: new Date(), reason: null });
      }
      settle(plan);
      return { kind: "opened", id: wo.id, woNo: wo.woNo, seq, type, need };
    },
    async workOrdersOf(planId) {
      return workOrders.filter((wo) => wo.planId === planId).sort((a, b) => a.seq - b.seq).map(toWorkOrder);
    },
    async getWorkOrder(id) {
      const wo = workOrders.find((item) => item.id === id);
      return wo ? toWorkOrder(wo) : null;
    },
    async jobs(userId, options) {
      return workOrders
        .filter((wo) => wo.status !== "CANCELLED" && (userId === null || wo.assigneeIds.includes(userId)))
        .filter((wo) => {
          if (!options?.activeOnly) return true;
          const plan = plans.find((item) => item.id === wo.planId);
          return Boolean(plan) && OPEN_WORK_ORDER_STATUSES.includes(wo.status) && plan?.status !== "CANCELLED" && plan?.status !== "COMPLETED";
        })
        .sort(byJobOrder)
        .map((wo): JobCard => {
          const plan = plans.find((item) => item.id === wo.planId)!;
          const doc = docs.find((item) => item.id === plan.docId)!;
          return {
            ...toWorkOrder(wo), planNo: plan.planNo, modelCode: models.get(plan.modelId)?.code ?? "", description: plan.description,
            docType: doc.docType, docNo: doc.docNo, vendorName: vendorName(doc.vendorId),
          };
        });
    },
    async jobHistory(filter) {
      const matching = workOrders
        .filter((wo) => !OPEN_WORK_ORDER_STATUSES.includes(wo.status))
        .filter((wo) => filter.userId === null || wo.assigneeIds.includes(filter.userId))
        .filter((wo) => (filter.kind === "all" ? true : filter.kind === "cancelled" ? wo.status === "CANCELLED" : wo.status !== "CANCELLED"))
        .filter((wo) => !filter.fromDate || wo.calledDate >= filter.fromDate)
        .sort((a, b) => b.calledDate.localeCompare(a.calledDate) || b.seq - a.seq);
      const start = (filter.page - 1) * filter.pageSize;
      const rows = matching.slice(start, start + filter.pageSize).map((wo): JobCard => {
        const plan = plans.find((item) => item.id === wo.planId)!;
        const doc = docs.find((item) => item.id === plan.docId)!;
        return {
          ...toWorkOrder(wo), planNo: plan.planNo, modelCode: models.get(plan.modelId)?.code ?? "", description: plan.description,
          docType: doc.docType, docNo: doc.docNo, vendorName: vendorName(doc.vendorId),
        };
      });
      return { rows, total: matching.length };
    },
    async setAssignees(id, change) {
      const wo = workOrders.find((item) => item.id === id);
      if (!wo) return { kind: "not_found" };
      if (workOrderBlock(wo, "assignees")) return { kind: "locked" };
      const missing = unavailable(change.assigneeIds.filter((userId) => !wo.assigneeIds.includes(userId)));
      if (missing.length > 0) return { kind: "assignees_unavailable", userIds: missing };
      const before = wo.assigneeIds;
      wo.assigneeIds = [...change.assigneeIds];
      return { kind: "saved", planId: wo.planId, woNo: wo.woNo, before };
    },
    async cancelWorkOrder(id, change) {
      const wo = workOrders.find((item) => item.id === id);
      if (!wo) return { kind: "not_found" };
      const block = workOrderBlock(wo, "cancel");
      if (block) return { kind: "locked", block };
      const plan = plans.find((item) => item.id === wo.planId)!;
      wo.status = "CANCELLED";
      wo.cancelReason = change.reason;
      plan.lotCalledTotal -= wo.calledQty;
      const live = workOrders.some((item) => item.planId === plan.id && item.status !== "CANCELLED");
      if (!live && plan.status === "ASSIGNED") {
        plan.status = "OPEN";
        history.push({ planId: plan.id, from: "ASSIGNED", to: "OPEN", by: change.by, at: new Date(), reason: change.reason });
      }
      return { kind: "cancelled", planId: plan.id, woNo: wo.woNo, calledQty: wo.calledQty };
    },
  };
  return store;
}

/** A few rows so the screens work without SQL Server (DB_SERVER empty). Not used when a database is configured. */
export const DEMO_MASTER = {
  vendors: [
    { id: 1, name: "Zhejiang Hongyou", isActive: true },
    { id: 2, name: "Taizhou Aipu", isActive: true },
    { id: 3, name: "PUMA (โรงงาน)", isActive: true },
  ] satisfies VendorInfo[],
  models: [
    { id: 1, code: "XM2525", description: "ปั๊มลมโรตารี่ 1/4HP 25L", brandName: "TRW", origin: "IMPORTED", isActive: true, pumpType: "Rotary", qcChecklist: "QC-ROTARY", qaChecklist: "QA-ROTARY" },
    { id: 2, code: "OL-1550", description: "ปั๊มลม Oil-less 1.5HP 50L", brandName: "TRW", origin: "IMPORTED", isActive: true, pumpType: "Oil-free", qcChecklist: "QC-OILFREE", qaChecklist: "QA-OILFREE" },
    { id: 3, code: "PP-32", description: "ปั๊มลมสายพาน PUMA 1/2HP", brandName: "PUMA", origin: "DOMESTIC", isActive: true, pumpType: "Piston", qcChecklist: "QC-408", qaChecklist: null },
  ] satisfies ModelInfo[],
};
