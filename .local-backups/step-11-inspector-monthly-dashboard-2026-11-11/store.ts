import type {
  EntryMode,
  FailedItemFinding,
  InspectionItem,
  InspectionRole,
  InspectionTemplateData,
  InspectorProgress,
  ItemAnswer,
  PendingReworkItem,
  PlanInspectionSummary,
  PlanUnitInspectionItem,
  ReworkDetails,
  SelectedDefect,
  SerialEntryMode,
  StoredInspection,
  SubmitReworkInput,
  UnitAction,
  UnitResult,
} from "./types";

export type { InspectionTemplateData, StoredInspection };

export type ActiveClaim = {
  inspectionId: string;
  serialPump: string;
  inspectorId: string;
  inspectorName: string;
  startedAt: Date;
};

export type InspectionQuota = {
  qtyNeed: number;
  qtyDone: number;
  inProgress: number;
  remaining: number;
  activeClaims: ActiveClaim[];
};

export type NewClaimInput = {
  id?: string;
  planId: number;
  workOrderId: string;
  role: InspectionRole;
  serialPump: string;
  serialMotor?: string | null;
  serialSupplier?: string | null;
  serialEntryMode: SerialEntryMode;
  entryMode: EntryMode;
  inspectorId: string;
  inspectorName: string;
};

export type ClaimOutcome =
  | { kind: "claimed"; inspection: StoredInspection; quota: InspectionQuota }
  | { kind: "resumed"; inspection: StoredInspection; quota: InspectionQuota }
  | { kind: "already_completed"; message: string }
  | { kind: "claimed_by_other"; message: string; inspectorName: string }
  | { kind: "quota_full"; message: string; quota: InspectionQuota }
  | { kind: "not_found"; message: string };

export type CompletedInspectionInput = {
  inspectionId: string;
  workOrderId: string;
  planId: number;
  role: InspectionRole;
  answers: Record<number, ItemAnswer>;
  result: UnitResult;
  action: UnitAction | null;
  suggestedAction: UnitAction | null;
  inspectorId: string;
};

export type SubmitInspectionOutcome =
  | { kind: "saved"; inspection: StoredInspection; qtyDone: number; qtyNeed: number }
  | { kind: "not_found"; message: string }
  | { kind: "not_in_progress"; message: string };

export interface InspectionStore {
  getTemplate(planId: number, role: InspectionRole): Promise<InspectionTemplateData | null>;
  getActiveClaims(workOrderId: string): Promise<ActiveClaim[]>;
  getQuota(workOrderId: string): Promise<InspectionQuota | null>;
  findInspection(id: string): Promise<StoredInspection | null>;
  claimUnit(input: NewClaimInput): Promise<ClaimOutcome>;
  cancelClaim(inspectionId: string, inspectorId: string): Promise<boolean>;
  submitResult(input: CompletedInspectionInput): Promise<SubmitInspectionOutcome>;
  getPendingReworks(inspectorId?: string | null): Promise<PendingReworkItem[]>;
  getReworkDetails(inspectionId: string): Promise<ReworkDetails | null>;
  submitRework(input: SubmitReworkInput, inspectorId: string): Promise<SubmitInspectionOutcome>;
  getPlanInspectionSummary(planId: number): Promise<PlanInspectionSummary>;
  getPlanInspections(planId: number): Promise<PlanUnitInspectionItem[]>;
  getInspectorDoneCounts?(workOrderIds: string[]): Promise<Map<string, number>>;
  /** Key = `<workOrderId>:<inspectorId>`. */
  getInspectorProgress?(workOrderIds: string[]): Promise<Map<string, InspectorProgress>>;
}

/** Demo template items for in-memory and test stores (reflecting standard Piston checklist). */
export const DEMO_INSPECTION_ITEMS: InspectionItem[] = [
  {
    id: 1,
    seq: 1,
    topicCode: "CHK-01",
    title: "ตรวจสอบสภาพภายนอก ถังลม และสีเคลือบผิว",
    inputType: "PASS_FAIL",
    isRequired: true,
    photoRule: "ON_FAIL",
    videoRule: "NONE",
    animationType: "SCAN_PUMP",
    helpText: "ตรวจดูรอยถลอก รอยบุบ หรือรอยเชื่อมที่มีตำหนิ",
  },
  {
    id: 2,
    seq: 2,
    topicCode: "CHK-02",
    title: "ตรวจสอบความแน่นของน็อตยึดและชิ้นส่วนประกอบ",
    inputType: "PASS_FAIL",
    isRequired: true,
    photoRule: "ON_FAIL",
    videoRule: "NONE",
    animationType: "PISTON_HEAD",
    helpText: "ขันแน่นตามมาตรฐาน ไม่หลวมคลอน",
  },
  {
    id: 3,
    seq: 3,
    topicCode: "CHK-03",
    title: "ตรวจสอบระดับและคุณภาพน้ำมันหล่อลื่น",
    inputType: "PASS_FAIL",
    isRequired: true,
    photoRule: "ON_FAIL",
    videoRule: "NONE",
    animationType: "AIR_TANK",
    helpText: "ระดับน้ำมันอยู่กึ่งกลางตาแมว สีใส ไม่ขุ่น",
  },
  {
    id: 4,
    seq: 4,
    topicCode: "CHK-04",
    title: "ทดสอบการเดินเครื่อง มู่เล่ย์ และสายพาน",
    inputType: "PASS_FAIL",
    isRequired: true,
    photoRule: "ON_FAIL",
    videoRule: "ON_FAIL",
    animationType: "MOTOR_BELT",
    helpText: "ตรวจสอบความเรียบร้อยขณะสายพานและมู่เล่ย์หมุนทำงาน",
  },
  {
    id: 5,
    seq: 5,
    topicCode: "CHK-05",
    title: "ตรวจสอบการรั่วซึมของลมตามข้อต่อและเช็ควาล์ว",
    inputType: "PASS_FAIL",
    isRequired: true,
    photoRule: "ON_FAIL",
    videoRule: "ON_FAIL",
    animationType: "VALVE_LEAK",
    helpText: "ใช้น้ำสบู่ตรวจเช็ครอยรั่วรอบจุดต่อ",
  },
  {
    id: 6,
    seq: 6,
    topicCode: "CHK-06",
    title: "วัดแรงดันตัดอัตโนมัติ (Cut-out Pressure) (Bar)",
    inputType: "NUMBER",
    isRequired: true,
    photoRule: "NONE",
    videoRule: "NONE",
    animationType: "PRESSURE_GAUGE",
    helpText: "บันทึกค่าแรงดันเมื่อ Pressure Switch สั่งตัดการทำงาน",
  },
  {
    id: 7,
    seq: 7,
    topicCode: "CHK-07",
    title: "หมายเหตุและข้อสังเกตเพิ่มเติม",
    inputType: "TEXT",
    isRequired: false,
    photoRule: "NONE",
    videoRule: "NONE",
    animationType: "GENERAL_CHECK",
  },
];

export const DEMO_DEFECTS_BY_ITEM: Record<number, SelectedDefect[]> = {
  1: [
    {
      defectId: 101,
      code: "DEF00101",
      nameTh: "สีถลอก/มีรอยขีดข่วน",
      part: "ขาถัง",
      severity: "MINOR",
      disposition: "CONCESSION",
    },
    {
      defectId: 102,
      code: "DEF00102",
      nameTh: "ถังลมบุบ/ผิดรูป",
      part: "ถังลม",
      severity: "CRITICAL",
      disposition: "REJECT",
      requiresVideo: true,
    },
  ],
  2: [
    {
      defectId: 201,
      code: "DEF00201",
      nameTh: "น็อตยึดแท่นมอเตอร์หลวม",
      part: "แท่นมอเตอร์",
      severity: "MAJOR",
      disposition: "REWORK",
    },
  ],
  3: [
    {
      defectId: 301,
      code: "DEF00301",
      nameTh: "น้ำมันต่ำกว่าระดับเกจ",
      part: "ห้องข้อเหวี่ยง",
      severity: "MINOR",
      disposition: "REWORK",
    },
  ],
  4: [
    {
      defectId: 401,
      code: "DEF00401",
      nameTh: "สายพานหย่อน/ไม่ได้ศูนย์",
      part: "สายพาน",
      severity: "MAJOR",
      disposition: "CHOOSE",
      requiresVideo: true,
    },
  ],
  5: [
    {
      defectId: 501,
      code: "DEF00501",
      nameTh: "ลมรั่วซึมที่เช็ควาล์ว",
      part: "เช็ควาล์ว",
      severity: "MAJOR",
      disposition: "REWORK",
      requiresVideo: true,
    },
    {
      defectId: 502,
      code: "DEF00502",
      nameTh: "ถังลมรั่วที่แนวรอยเชื่อม",
      part: "แนวเชื่อมถัง",
      severity: "CRITICAL",
      disposition: "REJECT",
      requiresVideo: true,
    },
  ],
};

export type MemoryInspectionStore = InspectionStore & {
  seedTemplate(
    planId: number,
    role: InspectionRole,
    data: Partial<InspectionTemplateData> | InspectionItem[],
  ): void;
  seedWorkOrder(wo: {
    id: string;
    qtyNeed: number;
    qtyDone?: number;
    planId?: number;
    woNo?: string;
  }): void;
};

/** In-memory inspection store for development, demonstration, and tests. */
export function createMemoryInspectionStore(): MemoryInspectionStore {
  const inspections = new Map<string, StoredInspection>();
  // Work order status: id -> { qtyNeed, qtyDone }
  const workOrders = new Map<string, { qtyNeed: number; qtyDone: number }>();
  const customTemplates = new Map<string, InspectionTemplateData>();

  // Initialize demo work order
  workOrders.set("wo-demo-1", { qtyNeed: 10, qtyDone: 0 });

  return {
    seedTemplate(
      planId: number,
      role: InspectionRole,
      data: Partial<InspectionTemplateData> | InspectionItem[],
    ) {
      const items = Array.isArray(data) ? data : data.items ?? DEMO_INSPECTION_ITEMS;
      const tplData: InspectionTemplateData = {
        template: (!Array.isArray(data) && data.template) || {
          id: 1,
          code: "TPL-CUSTOM",
          name: "แบบตรวจกำหนดเอง",
          role,
          versionId: 1,
          versionNo: 1,
        },
        items,
        itemDefects: (!Array.isArray(data) && data.itemDefects) || DEMO_DEFECTS_BY_ITEM,
        brandGroup: (!Array.isArray(data) && data.brandGroup) || "PUMA",
        modelCode: (!Array.isArray(data) && data.modelCode) || "PP-23P",
        modelDescription: (!Array.isArray(data) && data.modelDescription) || "ปั๊มลมลูกสูบ",
        planNo: (!Array.isArray(data) && data.planNo) || `QP-2610-${String(planId).padStart(4, "0")}`,
        docNo: (!Array.isArray(data) && data.docNo) || "INV-001",
      };
      customTemplates.set(`${planId}:${role}`, tplData);
    },

    seedWorkOrder(wo: {
      id: string;
      qtyNeed: number;
      qtyDone?: number;
      planId?: number;
      woNo?: string;
    }) {
      workOrders.set(wo.id, { qtyNeed: wo.qtyNeed, qtyDone: wo.qtyDone ?? 0 });
    },

    async getTemplate(planId: number, role: InspectionRole): Promise<InspectionTemplateData | null> {
      const custom = customTemplates.get(`${planId}:${role}`);
      if (custom) return custom;

      return {
        template: {
          id: 1,
          code: "TPL-PISTON-QC",
          name: "แบบตรวจรับปั๊มลมลูกสูบ (Piston)",
          role,
          versionId: 1,
          versionNo: 1,
        },
        items: DEMO_INSPECTION_ITEMS,
        itemDefects: DEMO_DEFECTS_BY_ITEM,
        brandGroup: "PUMA",
        modelCode: "PP-23P",
        modelDescription: "ปั๊มลมลูกสูบ 3HP ถัง 260L",
        planNo: `QP-2610-${String(planId).padStart(4, "0")}`,
        docNo: "INV-2610-001",
      };
    },

    async getActiveClaims(workOrderId: string): Promise<ActiveClaim[]> {
      const active: ActiveClaim[] = [];
      for (const item of inspections.values()) {
        if (item.workOrderId === workOrderId && item.status === "IN_PROGRESS") {
          active.push({
            inspectionId: item.id,
            serialPump: item.serialPump,
            inspectorId: item.inspectorId,
            inspectorName: item.inspectorName ?? item.inspectorId,
            startedAt: item.startedAt,
          });
        }
      }
      return active;
    },

    async getQuota(workOrderId: string): Promise<InspectionQuota | null> {
      const wo = workOrders.get(workOrderId) ?? { qtyNeed: 10, qtyDone: 0 };
      const activeClaims = await this.getActiveClaims(workOrderId);
      const remaining = Math.max(0, wo.qtyNeed - wo.qtyDone - activeClaims.length);
      return {
        qtyNeed: wo.qtyNeed,
        qtyDone: wo.qtyDone,
        inProgress: activeClaims.length,
        remaining,
        activeClaims,
      };
    },

    async findInspection(id: string): Promise<StoredInspection | null> {
      return inspections.get(id) ?? null;
    },

    async claimUnit(input: NewClaimInput): Promise<ClaimOutcome> {
      const quota = await this.getQuota(input.workOrderId);
      if (!quota) return { kind: "not_found", message: "ไม่พบใบงานที่ระบุ" };

      // 1. Check if serial is already completed in this plan
      for (const item of inspections.values()) {
        if (
          item.planId === input.planId &&
          item.serialPump === input.serialPump &&
          item.status === "COMPLETED"
        ) {
          return {
            kind: "already_completed",
            message: `Serial ${input.serialPump} ได้รับการตรวจแล้วในแผนนี้ — บันทึกซ้ำไม่ได้`,
          };
        }
      }

      // 2. Check if serial is currently in progress
      for (const item of inspections.values()) {
        if (
          item.planId === input.planId &&
          item.serialPump === input.serialPump &&
          item.status === "IN_PROGRESS"
        ) {
          if (item.inspectorId === input.inspectorId) {
            return { kind: "resumed", inspection: item, quota };
          }
          return {
            kind: "claimed_by_other",
            message: `เครื่องนี้กำลังตรวจโดย ${item.inspectorName ?? item.inspectorId} — ไม่สามารถตรวจซ้ำได้`,
            inspectorName: item.inspectorName ?? item.inspectorId,
          };
        }
      }

      // 3. Check quota availability
      if (quota.remaining <= 0) {
        return {
          kind: "quota_full",
          message: `ยอดตรวจครบจำนวนแล้ว (ต้องตรวจ ${quota.qtyNeed} · เสร็จแล้ว ${quota.qtyDone} · กำลังตรวจ ${quota.inProgress})`,
          quota,
        };
      }

      // 4. Create new in-progress claim
      const id = input.id ?? `insp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const stored: StoredInspection = {
        id,
        planId: input.planId,
        workOrderId: input.workOrderId,
        role: input.role,
        cycleNo: 1,
        roundNo: 1,
        inspectionNo: quota.qtyDone + quota.inProgress + 1,
        serialPump: input.serialPump,
        serialMotor: input.serialMotor ?? null,
        serialSupplier: input.serialSupplier ?? null,
        serialEntryMode: input.serialEntryMode,
        entryMode: input.entryMode,
        inspectorId: input.inspectorId,
        inspectorName: input.inspectorName,
        startedAt: new Date(),
        submittedAt: null,
        result: null,
        action: null,
        suggestedAction: null,
        status: "IN_PROGRESS",
        answers: {},
      };

      inspections.set(id, stored);
      const updatedQuota = await this.getQuota(input.workOrderId);

      return {
        kind: "claimed",
        inspection: stored,
        quota: updatedQuota!,
      };
    },

    async cancelClaim(inspectionId: string, inspectorId: string): Promise<boolean> {
      const item = inspections.get(inspectionId);
      if (!item || item.status !== "IN_PROGRESS") return false;
      if (item.inspectorId !== inspectorId) return false;

      item.status = "CANCELLED";
      return true;
    },

    async submitResult(input: CompletedInspectionInput): Promise<SubmitInspectionOutcome> {
      const item = inspections.get(input.inspectionId);
      if (!item) return { kind: "not_found", message: "ไม่พบข้อมูลการตรวจนี้" };
      if (item.status !== "IN_PROGRESS") {
        return { kind: "not_in_progress", message: "รายการตรวจนี้ไม่ได้อยู่ในสถานะกำลังตรวจ" };
      }

      item.status = "COMPLETED";
      item.submittedAt = new Date();
      item.result = input.result;
      item.action = input.action;
      item.suggestedAction = input.suggestedAction;
      item.answers = input.answers;

      const wo = workOrders.get(input.workOrderId) ?? { qtyNeed: 10, qtyDone: 0 };
      wo.qtyDone += 1;
      workOrders.set(input.workOrderId, wo);

      return {
        kind: "saved",
        inspection: item,
        qtyDone: wo.qtyDone,
        qtyNeed: wo.qtyNeed,
      };
    },

    async getPendingReworks(inspectorId?: string | null): Promise<PendingReworkItem[]> {
      const results: PendingReworkItem[] = [];
      const allInspections = Array.from(inspections.values());

      for (const item of allInspections) {
        if (item.status !== "COMPLETED" || item.result !== "NOT_PASSED" || item.action !== "REWORK") {
          continue;
        }
        if (inspectorId && item.inspectorId !== inspectorId) {
          continue;
        }
        const hasChild = allInspections.some(
          (other) => other.parentInspectionId === item.id && other.status !== "CANCELLED",
        );
        if (hasChild) continue;

        let failedItemCount = 0;
        const defectNamesList: string[] = [];
        if (item.answers) {
          for (const ans of Object.values(item.answers)) {
            if (ans.status === "FAIL") {
              failedItemCount += 1;
              if (ans.defects) {
                for (const d of ans.defects) {
                  if (d.nameTh && !defectNamesList.includes(d.nameTh)) {
                    defectNamesList.push(d.nameTh);
                  }
                }
              }
            }
          }
        }

        results.push({
          id: item.id,
          workOrderId: item.workOrderId ?? "wo-demo-1",
          woNo: `WO-${item.planId}-1`,
          planId: item.planId,
          planNo: `QP-2610-${String(item.planId).padStart(4, "0")}`,
          modelCode: "PP-23P",
          description: "ปั๊มลมลูกสูบ",
          serialPump: item.serialPump,
          roundNo: item.roundNo,
          failedItemCount: failedItemCount || 1,
          defectNames: defectNamesList.length > 0 ? defectNamesList.join(", ") : null,
          role: item.role,
          submittedAt: item.submittedAt ? item.submittedAt.toISOString() : null,
          inspectorId: item.inspectorId,
          inspectorName: item.inspectorName ?? "ผู้ตรวจ",
        });
      }

      return results.sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""));
    },

    async getReworkDetails(inspectionId: string): Promise<ReworkDetails | null> {
      const item = inspections.get(inspectionId);
      if (!item || item.status !== "COMPLETED" || item.action !== "REWORK") {
        return null;
      }

      const failedItems: FailedItemFinding[] = [];
      if (item.answers) {
        for (const [itemIdStr, ans] of Object.entries(item.answers)) {
          if (ans.status === "FAIL") {
            const itemId = Number(itemIdStr);
            const tmplItem = DEMO_INSPECTION_ITEMS.find((it) => it.id === itemId) ?? {
              id: itemId,
              seq: itemId,
              topicCode: `CHK-${String(itemId).padStart(2, "0")}`,
              title: `หัวข้อการตรวจที่ ${itemId}`,
              videoRule: "NONE" as const,
              inputType: "PASS_FAIL" as const,
              isRequired: true,
            };
            failedItems.push({
              itemId,
              seq: tmplItem.seq,
              topicCode: tmplItem.topicCode ?? null,
              title: tmplItem.title,
              videoRule: tmplItem.videoRule,
              defects: ans.defects ?? [],
              photos: ans.photos ?? [],
              video: ans.video ?? null,
              remark: ans.remark ?? null,
            });
          }
        }
      }

      if (failedItems.length === 0) {
        failedItems.push({
          itemId: 1,
          seq: 1,
          topicCode: "CHK-01",
          title: DEMO_INSPECTION_ITEMS[0].title,
          videoRule: "NONE",
          defects: [
            {
              defectId: 1,
              code: "DEF00101",
              nameTh: "สีไม่ผ่าน (ย้อย / ไม่เรียบ)",
              severity: "MAJOR",
              disposition: "REWORK",
            },
          ],
          photos: [],
          video: null,
          remark: "พบสีไม่สม่ำเสมอ",
        });
      }

      const template = await this.getTemplate(item.planId, item.role);

      return {
        inspection: item,
        planNo: `QP-2610-${String(item.planId).padStart(4, "0")}`,
        modelCode: "PP-23P",
        description: "ปั๊มลมลูกสูบ",
        failedItems,
        template,
        previousAnswers: item.answers ?? {},
      };
    },

    async submitRework(input: SubmitReworkInput, inspectorId: string): Promise<SubmitInspectionOutcome> {
      const parent = inspections.get(input.parentInspectionId);
      if (!parent) return { kind: "not_found", message: "ไม่พบข้อมูลการตรวจเดิม" };

      const allNormal = Object.values(input.answers).every((a) => a.status === "NORMAL");
      const result = allNormal ? "PASS" : "NOT_PASSED";
      const action = allNormal ? null : (input.decision ?? "REWORK");

      const childId = `rw-${Math.random().toString(36).slice(2, 10)}`;
      const childInspection: StoredInspection = {
        id: childId,
        planId: parent.planId,
        workOrderId: parent.workOrderId,
        role: parent.role,
        cycleNo: parent.cycleNo,
        roundNo: parent.roundNo + 1,
        inspectionNo: parent.inspectionNo,
        serialPump: parent.serialPump,
        serialMotor: parent.serialMotor,
        serialSupplier: parent.serialSupplier,
        serialEntryMode: parent.serialEntryMode,
        entryMode: parent.entryMode,
        inspectorId,
        inspectorName: parent.inspectorName,
        startedAt: new Date(),
        submittedAt: new Date(),
        result,
        action,
        suggestedAction: action,
        parentInspectionId: parent.id,
        status: "COMPLETED",
        answers: Object.fromEntries(
          Object.entries(input.answers).map(([k, v]) => [
            Number(k),
            {
              status: v.status,
              remark: v.remark,
              photos: v.photos,
              video: v.video,
              defects: [
                ...(v.fixes ?? []).map((f): SelectedDefect => ({
                  defectId: f.defectId,
                  code: `DEF-${f.defectId}`,
                  nameTh: f.fixMethod,
                  severity: "MAJOR",
                  disposition: "REWORK",
                })),
                ...(v.defects ?? []),
              ],
            },
          ]),
        ),
      };

      inspections.set(childId, childInspection);

      const wo = workOrders.get(parent.workOrderId ?? "") ?? { qtyNeed: 10, qtyDone: 1 };

      return {
        kind: "saved",
        inspection: childInspection,
        qtyDone: wo.qtyDone,
        qtyNeed: wo.qtyNeed,
      };
    },

    async getPlanInspectionSummary(planId: number): Promise<PlanInspectionSummary> {
      const all = Array.from(inspections.values()).filter(
        (i) => i.planId === planId && i.status !== "CANCELLED",
      );
      let passCount = 0;
      let reworkCount = 0;
      let rejectCount = 0;
      let inProgressCount = 0;

      for (const item of all) {
        if (item.status === "IN_PROGRESS") {
          inProgressCount += 1;
        } else if (item.status === "COMPLETED") {
          if (item.result === "PASS") {
            passCount += 1;
          } else if (item.result === "NOT_PASSED") {
            if (item.action === "REWORK") {
              const hasChild = all.some((other) => other.parentInspectionId === item.id);
              if (!hasChild) reworkCount += 1;
            } else if (item.action === "REJECT") {
              rejectCount += 1;
            }
          }
        }
      }

      return { passCount, reworkCount, rejectCount, inProgressCount };
    },

    async getPlanInspections(planId: number): Promise<PlanUnitInspectionItem[]> {
      const all = Array.from(inspections.values()).filter(
        (i) => i.planId === planId && i.status !== "CANCELLED",
      );
      const items: PlanUnitInspectionItem[] = [];

      for (const item of all) {
        let failedItemCount = 0;
        const defectNamesList: string[] = [];
        if (item.answers) {
          for (const ans of Object.values(item.answers)) {
            if (ans.status === "FAIL") {
              failedItemCount += 1;
              if (ans.defects) {
                for (const d of ans.defects) {
                  if (d.nameTh && !defectNamesList.includes(d.nameTh)) {
                    defectNamesList.push(d.nameTh);
                  }
                }
              }
            }
          }
        }

        items.push({
          id: item.id,
          workOrderId: item.workOrderId ?? `wo-${planId}-1`,
          woNo: `WO-${planId}-${item.roundNo ?? 1}`,
          role: item.role,
          cycleNo: item.cycleNo,
          roundNo: item.roundNo,
          inspectionNo: item.inspectionNo ?? 1,
          serialPump: item.serialPump,
          serialMotor: item.serialMotor ?? null,
          serialSupplier: item.serialSupplier ?? null,
          result: item.result,
          failureDecision: item.action,
          inspectorId: item.inspectorId,
          inspectorName: item.inspectorName ?? "ผู้ตรวจ",
          startedAt: item.startedAt.toISOString(),
          submittedAt: item.submittedAt ? item.submittedAt.toISOString() : null,
          status: item.status,
          failedItemCount,
          defectNames: defectNamesList.length > 0 ? defectNamesList.join(", ") : null,
        });
      }

      return items.sort(
        (a, b) =>
          (b.submittedAt ?? b.startedAt).localeCompare(a.submittedAt ?? a.startedAt) ||
          b.id.localeCompare(a.id),
      );
    },

    async getInspectorDoneCounts(workOrderIds: string[]): Promise<Map<string, number>> {
      const counts = new Map<string, number>();
      const set = new Set(workOrderIds);
      for (const item of inspections.values()) {
        if (item.workOrderId && set.has(item.workOrderId) && item.status === "COMPLETED") {
          const key = `${item.workOrderId}:${item.inspectorId}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
      return counts;
    },

    async getInspectorProgress(workOrderIds: string[]): Promise<Map<string, InspectorProgress>> {
      const progress = new Map<string, InspectorProgress>();
      const set = new Set(workOrderIds);
      const all = Array.from(inspections.values());
      for (const item of all) {
        if (!item.workOrderId || !set.has(item.workOrderId) || item.status !== "COMPLETED") continue;
        const key = `${item.workOrderId}:${item.inspectorId}`;
        const entry = progress.get(key) ?? { done: 0, passed: 0, reworkPending: 0, rejected: 0 };
        if (!item.parentInspectionId) entry.done += 1;
        const isLeaf = !all.some((other) => other.parentInspectionId === item.id && other.status !== "CANCELLED");
        if (isLeaf) {
          if (item.result === "PASS") entry.passed += 1;
          else if (item.result === "NOT_PASSED" && item.action === "REWORK") entry.reworkPending += 1;
          else if (item.result === "NOT_PASSED") entry.rejected += 1;
        }
        progress.set(key, entry);
      }
      return progress;
    },
  };
}
