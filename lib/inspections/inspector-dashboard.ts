import "server-only";

import type { SessionUser } from "@/lib/auth/types";
import { resolveActorId } from "@/lib/db/actor";
import { dbConfigured } from "@/lib/db/config";
import { thaiToday } from "@/lib/plans/rules";
import { getPlanStore } from "@/lib/plans/runtime";
import { OPEN_WORK_ORDER_STATUSES } from "@/lib/plans/rules";
import { getInspectionStore } from "./runtime";
import type { InspectionDraft, InspectorMonthlyStats, InspectorProgress, PendingReworkItem } from "./types";

const THAI_MONTH_NAMES = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
] as const;

export function formatThaiMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return yearMonth;
  return `${THAI_MONTH_NAMES[m - 1]} ${y + 543}`;
}

export function generateAvailableMonths(anchorDate: string, count = 6): { value: string; label: string }[] {
  const [startY, startM] = anchorDate.split("-").map(Number);
  const options: { value: string; label: string }[] = [];
  let y = startY;
  let m = startM;

  for (let i = 0; i < count; i++) {
    const val = `${y}-${String(m).padStart(2, "0")}`;
    options.push({ value: val, label: formatThaiMonth(val) });
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return options;
}

export type InspectorUrgentStatus = {
  reworkCount: number;
  inProgressCount: number;
  notStartedCount: number;
  totalPendingUnits: number;
};

export type InspectorMonthlyPerformance = {
  yearMonth: string;
  monthLabel: string;
  totalInspected: number;
  passedUnits: number;
  failedUnits: number;
  reworkResolvedCount: number;
  passRate: number;
  completedWorkOrders: number;
  topDefectName: string | null;
};

export type InspectorQuickAction =
  | {
      kind: "rework";
      id: string; // unit_inspections.id
      workOrderId: string;
      woNo: string;
      modelCode: string;
      description: string | null;
      serialPump: string;
      defectNames: string | null;
      roundNo: number;
    }
  | {
      kind: "inspect";
      id: string; // workOrderId
      woNo: string;
      planId: number;
      modelCode: string;
      description: string | null;
      qtyNeed: number;
      qtyDone: number;
      remainingQty: number;
      vendorName?: string | null;
      role: "QC" | "QA";
      draftInspectionId?: string | null;
      draftSerialPump?: string | null;
    };

export type InspectorHomePayload = {
  inspector: {
    id: string;
    fullName: string;
    employeeCode: string;
  };
  side: "QC" | "QA";
  jobsHref: "/jobs" | "/qa-queue";
  selectedMonth: string;
  availableMonths: { value: string; label: string }[];
  urgentStatus: InspectorUrgentStatus;
  monthlyPerformance: InspectorMonthlyPerformance;
  quickActions: InspectorQuickAction[];
};

export type InspectorHomeResult =
  | { kind: "loaded"; payload: InspectorHomePayload }
  | { kind: "forbidden" };

export async function loadInspectorDashboard(
  user: SessionUser,
  queryMonth?: string | null,
): Promise<InspectorHomeResult> {
  const isInspector = user.roles.includes("QC_INSPECTOR") || user.roles.includes("QA_INSPECTOR");
  if (!isInspector) {
    return { kind: "forbidden" };
  }

  const today = thaiToday(new Date());
  const currentYearMonth = today.slice(0, 7);
  const availableMonths = generateAvailableMonths(today, 6);
  const selectedMonth =
    queryMonth && /^\d{4}-\d{2}$/.test(queryMonth)
      ? queryMonth
      : currentYearMonth;

  const actorId = dbConfigured() ? await resolveActorId(user.id) : user.id;
  const isQaOnly = user.roles.includes("QA_INSPECTOR") && !user.roles.includes("QC_INSPECTOR");
  const isQcOnly = user.roles.includes("QC_INSPECTOR") && !user.roles.includes("QA_INSPECTOR");
  const querySide: "QA" | "QC" | undefined = isQaOnly ? "QA" : isQcOnly ? "QC" : undefined;
  const side: "QA" | "QC" = isQaOnly ? "QA" : "QC";
  const jobsHref: "/qa-queue" | "/jobs" = isQaOnly ? "/qa-queue" : "/jobs";

  const planStore = getPlanStore();
  const inspectionStore = getInspectionStore();

  let reworks: PendingReworkItem[] = [];
  try {
    const rawReworks = await inspectionStore.getPendingReworks(actorId);
    reworks = querySide ? rawReworks.filter((rw) => rw.role === querySide) : rawReworks;
  } catch {
    reworks = [];
  }

  const [activeJobs, allJobs] = await Promise.all([
    planStore.jobs(actorId, { activeOnly: true, side: querySide }),
    planStore.jobs(actorId, { side: querySide }),
  ]);

  const uniqueJobMap = new Map<string, typeof activeJobs[number]>();
  for (const j of activeJobs) uniqueJobMap.set(j.id, j);
  for (const j of allJobs) {
    if (!uniqueJobMap.has(j.id)) uniqueJobMap.set(j.id, j);
  }
  const myJobs = Array.from(uniqueJobMap.values());

  let progressMap = new Map<string, InspectorProgress>();
  if (inspectionStore.getInspectorProgress && myJobs.length > 0) {
    try {
      progressMap = await inspectionStore.getInspectorProgress(myJobs.map((j) => j.id));
    } catch {
      progressMap = new Map();
    }
  }

  let inProgressCount = 0;
  let notStartedCount = 0;
  let totalPendingUnits = 0;
  let completedWorkOrders = 0;

  const actionableJobs: {
    job: typeof myJobs[number];
    mineTarget: number;
    mineDone: number;
    remaining: number;
    drafts: InspectionDraft[];
  }[] = [];

  for (const job of myJobs) {
    const mine = job.assignees.find((a) => String(a.userId) === String(actorId));
    const mineTarget = mine?.targetQty ?? job.qtyNeed;
    const prog = actorId ? progressMap.get(`${job.id}:${actorId}`) : undefined;
    const mineDone = prog?.done ?? 0;
    const reworkPending = prog?.reworkPending ?? 0;
    const drafts = prog?.drafts ?? [];
    const isCompleted = mineTarget > 0 && mineDone >= mineTarget && reworkPending === 0 && drafts.length === 0;

    const isOpenStatus = OPEN_WORK_ORDER_STATUSES.includes(job.status);

    if (isOpenStatus && !isCompleted) {
      const remaining = Math.max(0, mineTarget - mineDone);
      totalPendingUnits += remaining;

      if (mineDone > 0 || drafts.length > 0) {
        inProgressCount += 1;
      } else {
        notStartedCount += 1;
      }

      actionableJobs.push({ job, mineTarget, mineDone, remaining, drafts });
    } else {
      // Completed work order check for the selected month
      if (job.status === "CLOSED" || job.status === "SUBMITTED" || isCompleted) {
        // If calledDate or completed timestamp falls in the selected month
        if (job.calledDate.startsWith(selectedMonth)) {
          completedWorkOrders += 1;
        }
      }
    }
  }

  // Monthly stats from inspectionStore
  let stats: InspectorMonthlyStats = {
    totalInspected: 0,
    passedCount: 0,
    failedCount: 0,
    reworkResolvedCount: 0,
    firstTimePassRate: 100,
    topDefectName: null,
  };

  if (actorId && inspectionStore.getInspectorMonthlyStats) {
    try {
      stats = await inspectionStore.getInspectorMonthlyStats(actorId, selectedMonth);
    } catch {
      // keep fallback defaults
    }
  }

  // Assemble quick actions: up to 2 reworks + actionable jobs, max 3 items
  const quickActions: InspectorQuickAction[] = [];
  for (const rw of reworks.slice(0, 2)) {
    quickActions.push({
      kind: "rework",
      id: rw.id,
      workOrderId: rw.workOrderId,
      woNo: rw.woNo,
      modelCode: rw.modelCode,
      description: rw.description,
      serialPump: rw.serialPump,
      defectNames: rw.defectNames,
      roundNo: rw.roundNo,
    });
  }

  const remainingSlots = 3 - quickActions.length;
  // Sort actionable jobs: drafts first, then in-progress, then earlier calledDate
  actionableJobs.sort((a, b) => {
    if (a.drafts.length > 0 && b.drafts.length === 0) return -1;
    if (a.drafts.length === 0 && b.drafts.length > 0) return 1;
    if (a.mineDone > 0 && b.mineDone === 0) return -1;
    if (a.mineDone === 0 && b.mineDone > 0) return 1;
    return a.job.calledDate.localeCompare(b.job.calledDate);
  });

  for (const { job, mineTarget, mineDone, remaining, drafts } of actionableJobs.slice(0, remainingSlots)) {
    const activeDraft = drafts[0];
    quickActions.push({
      kind: "inspect",
      id: job.id,
      woNo: job.woNo,
      planId: job.planId,
      modelCode: job.modelCode,
      description: job.description,
      qtyNeed: mineTarget,
      qtyDone: mineDone,
      remainingQty: remaining,
      vendorName: job.vendorName,
      role: job.type === "QA" ? "QA" : "QC",
      draftInspectionId: activeDraft?.inspectionId ?? null,
      draftSerialPump: activeDraft?.serialPump ?? null,
    });
  }

  return {
    kind: "loaded",
    payload: {
      inspector: {
        id: user.id,
        fullName: user.fullName,
        employeeCode: user.employeeCode,
      },
      side,
      jobsHref,
      selectedMonth,
      availableMonths,
      urgentStatus: {
        reworkCount: reworks.length,
        inProgressCount,
        notStartedCount,
        totalPendingUnits,
      },
      monthlyPerformance: {
        yearMonth: selectedMonth,
        monthLabel: formatThaiMonth(selectedMonth),
        totalInspected: stats.totalInspected,
        passedUnits: stats.passedCount,
        failedUnits: stats.failedCount,
        reworkResolvedCount: stats.reworkResolvedCount,
        passRate: stats.firstTimePassRate,
        completedWorkOrders,
        topDefectName: stats.topDefectName,
      },
      quickActions,
    },
  };
}
