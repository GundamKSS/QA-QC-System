import { describe, expect, it } from "vitest";
import {
  assigneeSlots,
  callInError,
  cancelBlock,
  canFlagWaitingGoods,
  canOpenWorkOrder,
  teamAverage,
  teamMax,
  workloadOf,
  workOrderBlock,
  CHECKLIST_STATUSES,
  checklistStatusOf,
  daysLeft,
  formatPlanNo,
  failsWhenSettled,
  formatWorkOrderNo,
  isOverInspect,
  lotSettled,
  meetsNeed,
  minCallIn,
  newSerials,
  normalizeSerial,
  normalizeDocNo,
  PLAN_STATUSES,
  PLAN_STATUS_NAMES,
  planStatusLabel,
  periodOf,
  planWorkOrder,
  progressOf,
  qcDeadline,
  qcRequired,
  splitAssigneeTargets,
  takesCallInDate,
  thaiToday,
  validateAssigneeTargets,
} from "@/lib/plans/rules";

describe("normalizeDocNo (BR-01)", () => {
  it("trims, collapses spaces and upper-cases", () => {
    expect(normalizeDocNo("  inv  2610-001 ")).toBe("INV 2610-001");
    expect(normalizeDocNo("ｉｎｖ001")).toBe("INV001");
  });
});

describe("qcRequired (BR-02, AC FR-PLAN-06)", () => {
  it("inspects a fixed 3 for lots of 1–30 (never more than the lot)", () => {
    expect(qcRequired(30)).toBe(3);
    expect(qcRequired(5)).toBe(3);
    expect(qcRequired(3)).toBe(3);
    expect(qcRequired(2)).toBe(2);
    expect(qcRequired(1)).toBe(1);
  });

  it("rounds 10% up from 31 units: 31 → 3.1 → 4 (user 28 Oct 2026)", () => {
    expect(qcRequired(31)).toBe(4);
    expect(qcRequired(40)).toBe(4);
    expect(qcRequired(80)).toBe(8);
    expect(qcRequired(81)).toBe(9);
    expect(qcRequired(350)).toBe(35);
    expect(qcRequired(500)).toBe(50);
  });

  it("uses the percent pinned on the plan from 31 units", () => {
    expect(qcRequired(350, 15)).toBe(53);
    expect(qcRequired(100, 12.5)).toBe(13);
    expect(qcRequired(40, 100)).toBe(40);
    expect(qcRequired(20, 100)).toBe(3);
  });

  it("rejects impossible input", () => {
    expect(() => qcRequired(0)).toThrow(RangeError);
    expect(() => qcRequired(1.5)).toThrow(RangeError);
    expect(() => qcRequired(10, 0)).toThrow(RangeError);
    expect(() => qcRequired(10, 101)).toThrow(RangeError);
  });
});

describe("planWorkOrder (docs/17 §1.1 — Meeting D)", () => {
  const lot = { qcRequired: 50 };

  it("follows the lot-500 example: Need = target 50 − True so far, whatever is called", () => {
    expect(planWorkOrder({ ...lot, calledQty: 200, qcDoneBefore: 0 })).toEqual({ type: "QC", need: 50 });
    // 30 inspected on the first call-in → 20 left
    expect(planWorkOrder({ ...lot, calledQty: 100, qcDoneBefore: 30 })).toEqual({ type: "QC", need: 20 });
    // 10 inspected → 40 left
    expect(planWorkOrder({ ...lot, calledQty: 300, qcDoneBefore: 10 })).toEqual({ type: "QC", need: 40 });
    // target reached → เรียกเข้าแก้ไข
    expect(planWorkOrder({ ...lot, calledQty: 200, qcDoneBefore: 50 })).toEqual({ type: "CALLIN_FIX", need: 0 });
  });

  it("follows the lot-100 example: calling 20 still needs 10", () => {
    expect(planWorkOrder({ qcRequired: 10, calledQty: 20, qcDoneBefore: 0 })).toEqual({ type: "QC", need: 10 });
  });

  it("caps Need by the call-in only when the end of the lot is smaller than what's left", () => {
    expect(planWorkOrder({ ...lot, calledQty: 30, qcDoneBefore: 0 })).toEqual({ type: "QC", need: 30 });
    expect(planWorkOrder({ qcRequired: 1, calledQty: 3, qcDoneBefore: 0 })).toEqual({ type: "QC", need: 1 });
  });

  it("treats over-inspection as done (never negative Need)", () => {
    expect(planWorkOrder({ ...lot, calledQty: 50, qcDoneBefore: 60 })).toEqual({ type: "CALLIN_FIX", need: 0 });
  });

  it("requires done ≥ Need", () => {
    expect(meetsNeed(20, 20)).toBe(true);
    expect(meetsNeed(30, 20)).toBe(true);
    expect(meetsNeed(19, 20)).toBe(false);
    expect(meetsNeed(0, 0)).toBe(true);
  });
});

describe("isOverInspect (user 11 Nov 2026)", () => {
  it("never flags work order #1 as over-inspection", () => {
    expect(isOverInspect({ nextSeq: 1, qcRequired: 50, qcDoneTotal: 50 })).toBe(false);
    expect(isOverInspect({ nextSeq: 1, qcRequired: 50, qcDoneTotal: 0, targetSum: 60 })).toBe(false);
  });

  it("flags work order #2 onwards when QC Need has reached max (qcDoneTotal >= qcRequired)", () => {
    expect(isOverInspect({ nextSeq: 2, qcRequired: 50, qcDoneTotal: 50 })).toBe(true);
    expect(isOverInspect({ nextSeq: 2, qcRequired: 50, qcDoneTotal: 52 })).toBe(true);
    expect(isOverInspect({ nextSeq: 3, qcRequired: 50, qcDoneTotal: 50 })).toBe(true);
    // Not reached yet
    expect(isOverInspect({ nextSeq: 2, qcRequired: 50, qcDoneTotal: 40 })).toBe(false);
  });

  it("flags work order #2 onwards when assigned targets exceed remaining QC Need", () => {
    // 50 required, 40 done -> 10 remaining. targetSum 15 -> exceeds by 5.
    expect(isOverInspect({ nextSeq: 2, qcRequired: 50, qcDoneTotal: 40, targetSum: 15 })).toBe(true);
    // targetSum matches exactly 10 -> not over
    expect(isOverInspect({ nextSeq: 2, qcRequired: 50, qcDoneTotal: 40, targetSum: 10 })).toBe(false);
    // targetSum less than 10 -> not over
    expect(isOverInspect({ nextSeq: 2, qcRequired: 50, qcDoneTotal: 40, targetSum: 8 })).toBe(false);
  });
});

describe("callInError (docs/17 §1.2)", () => {
  const lot = { lotQty: 500, qcRequired: 50 };

  it("keeps call-ins within the lot", () => {
    expect(callInError({ ...lot, lotCalledTotal: 300, qcDoneBefore: 50, calledQty: 200 })).toBeNull();
    expect(callInError({ ...lot, lotCalledTotal: 300, qcDoneBefore: 50, calledQty: 201 })).toBe("exceeds_remaining");
    expect(callInError({ ...lot, lotCalledTotal: 300, qcDoneBefore: 50, calledQty: 0 })).toBe("invalid_qty");
    expect(callInError({ ...lot, lotCalledTotal: 300, qcDoneBefore: 50, calledQty: 2.5 })).toBe("invalid_qty");
    expect(callInError({ ...lot, lotCalledTotal: 500, qcDoneBefore: 50, calledQty: 1 })).toBe("lot_fully_called");
  });

  it("refuses a call-in below Need on sheet #1, but allows any amount (≥ 1) on sheet #2 onwards (user 11 Nov 2026)", () => {
    // Sheet #1: lotCalledTotal = 0 or nextSeq = 1 -> must be >= Need (50)
    expect(callInError({ ...lot, lotCalledTotal: 0, qcDoneBefore: 0, calledQty: 49 })).toBe("below_need");
    expect(callInError({ ...lot, lotCalledTotal: 0, qcDoneBefore: 0, nextSeq: 1, calledQty: 49 })).toBe("below_need");
    expect(callInError({ ...lot, lotCalledTotal: 0, qcDoneBefore: 0, calledQty: 50 })).toBeNull();
    expect(callInError({ ...lot, lotCalledTotal: 0, qcDoneBefore: 0, calledQty: 200 })).toBeNull();
    expect(callInError({ lotQty: 100, qcRequired: 10, lotCalledTotal: 0, qcDoneBefore: 0, calledQty: 9 })).toBe("below_need");

    // Sheet #2 onwards (user 11 Nov 2026): can start at any amount
    expect(callInError({ ...lot, lotCalledTotal: 200, qcDoneBefore: 30, calledQty: 19 })).toBeNull();
    expect(callInError({ ...lot, lotCalledTotal: 200, qcDoneBefore: 30, nextSeq: 2, calledQty: 1 })).toBeNull();
    expect(callInError({ ...lot, lotCalledTotal: 200, qcDoneBefore: 30, nextSeq: 2, calledQty: 5 })).toBeNull();
  });

  it("calculates minimum call-in: Need for sheet #1, 1 for sheet #2 onwards", () => {
    expect(minCallIn({ ...lot, lotCalledTotal: 0, qcDoneBefore: 0, nextSeq: 1 })).toBe(50);
    expect(minCallIn({ ...lot, lotCalledTotal: 200, qcDoneBefore: 30, nextSeq: 2 })).toBe(1);
    expect(minCallIn({ ...lot, lotCalledTotal: 480, qcDoneBefore: 20, nextSeq: 1 })).toBe(20);
    expect(callInError({ ...lot, lotCalledTotal: 480, qcDoneBefore: 20, calledQty: 20 })).toBeNull();
    expect(minCallIn({ ...lot, lotCalledTotal: 500, qcDoneBefore: 50 })).toBe(0);
  });
});

describe("one work order per day, FAILED, Serial (docs/17 §1.3–1.5)", () => {
  it("counts every date-holding work order except cancelled ones", () => {
    expect(takesCallInDate("IN_PROGRESS")).toBe(true);
    expect(takesCallInDate("FAILED")).toBe(true);
    expect(takesCallInDate("CANCELLED")).toBe(false);
  });

  it("settles the lot only when the target is reached and the whole lot is called", () => {
    expect(lotSettled({ lotQty: 500, lotCalledTotal: 500, qcRequired: 50, qcDoneTotal: 50 })).toBe(true);
    expect(lotSettled({ lotQty: 500, lotCalledTotal: 400, qcRequired: 50, qcDoneTotal: 60 })).toBe(false);
    expect(lotSettled({ lotQty: 500, lotCalledTotal: 500, qcRequired: 50, qcDoneTotal: 49 })).toBe(false);
  });

  it("fails only open QC work orders with nothing inspected", () => {
    expect(failsWhenSettled({ status: "IN_PROGRESS", qtyNeed: 50, qtyDone: 0 })).toBe(true);
    expect(failsWhenSettled({ status: "RETURNED", qtyNeed: 10, qtyDone: 0 })).toBe(true);
    expect(failsWhenSettled({ status: "IN_PROGRESS", qtyNeed: 50, qtyDone: 1 })).toBe(false);
    expect(failsWhenSettled({ status: "IN_PROGRESS", qtyNeed: 0, qtyDone: 0 })).toBe(false);
    expect(failsWhenSettled({ status: "SUBMITTED", qtyNeed: 50, qtyDone: 0 })).toBe(false);
    expect(failsWhenSettled({ status: "CANCELLED", qtyNeed: 50, qtyDone: 0 })).toBe(false);
  });

  it("counts each Serial once per plan", () => {
    expect(normalizeSerial(" sn 001 ")).toBe("SN001");
    expect(newSerials(new Set(["SN001"]), ["sn001", "SN002", "sn 002", "", "SN003"])).toEqual(["SN002", "SN003"]);
  });
});

describe("numbering (BR-10)", () => {
  it("formats QP-YYMM-NNNN and work orders QP-YYMM-NNNN-seq", () => {
    expect(formatPlanNo("2610", 1)).toBe("QP-2610-0001");
    expect(formatPlanNo("2611", 123)).toBe("QP-2611-0123");
    expect(formatWorkOrderNo("QP-2610-0001", 1)).toBe("QP-2610-0001-1");
    expect(formatWorkOrderNo("QP-2610-0001", 12)).toBe("QP-2610-0001-12");
  });

  it("rejects bad periods and overflow", () => {
    expect(() => formatPlanNo("26-10", 1)).toThrow(RangeError);
    expect(() => formatPlanNo("2610", 0)).toThrow(RangeError);
    expect(() => formatPlanNo("2610", 10000)).toThrow(RangeError);
    expect(() => formatWorkOrderNo("QP-2610-0001", 0)).toThrow(RangeError);
  });

  it("takes the month in Thai time, so the run number resets on the Thai month boundary", () => {
    expect(periodOf(new Date("2026-10-31T16:59:59Z"))).toBe("2610"); // 23:59:59 on 31 Oct in Bangkok
    expect(periodOf(new Date("2026-10-31T17:00:00Z"))).toBe("2611"); // 00:00 on 1 Nov in Bangkok
    expect(periodOf(new Date("2026-12-31T18:00:00Z"))).toBe("2701");
  });
});

describe("qcDeadline (BR-11)", () => {
  it("is invoice date + 90 days", () => {
    expect(qcDeadline("2026-10-20")).toBe("2027-01-18");
    expect(qcDeadline("2028-01-01")).toBe("2028-03-31"); // leap year
    expect(qcDeadline("2026-10-20", 60)).toBe("2026-12-19");
  });

  it("rejects malformed dates", () => {
    expect(() => qcDeadline("2026-02-30")).toThrow(RangeError);
    expect(() => qcDeadline("20/10/2026")).toThrow(RangeError);
  });

  it("counts down in Thai days", () => {
    expect(thaiToday(new Date("2026-10-20T17:30:00Z"))).toBe("2026-10-21");
    expect(daysLeft("2027-01-18", "2026-10-20")).toBe(90);
    expect(daysLeft("2026-10-20", "2026-10-20")).toBe(0);
    expect(daysLeft("2026-10-19", "2026-10-20")).toBe(-1);
  });
});

describe("progressOf (BR-12)", () => {
  it("covers open plans", () => {
    expect(progressOf({ status: "OPEN", inspected: 0, required: 35 })).toBe("NOT_STARTED");
    expect(progressOf({ status: "QC_IN_PROGRESS", inspected: 10, required: 35 })).toBe("IN_PROGRESS");
    expect(progressOf({ status: "QC_REVIEW", inspected: 35, required: 35 })).toBe("AWAITING_CLOSE");
    expect(progressOf({ status: "QA_IN_PROGRESS", inspected: 35, required: 35, hasOpenRework: true })).toBe("IN_PROGRESS");
  });

  it("flags forgotten plans unless waiting for goods", () => {
    expect(progressOf({ status: "ASSIGNED", inspected: 0, required: 4, overdue: true })).toBe("UNDER");
    expect(progressOf({ status: "ASSIGNED", inspected: 0, required: 4, overdue: true, waitingGoods: true })).toBe("NOT_STARTED");
  });

  it("judges completed plans", () => {
    expect(progressOf({ status: "COMPLETED", inspected: 35, required: 35 })).toBe("DONE");
    expect(progressOf({ status: "COMPLETED", inspected: 40, required: 35 })).toBe("OVER");
    expect(progressOf({ status: "COMPLETED", inspected: 30, required: 35, forceClosed: true })).toBe("UNDER");
    expect(progressOf({ status: "CANCELLED", inspected: 3, required: 35 })).toBeNull();
  });
});

describe("assigneeSlots (docs/13 §1.4)", () => {
  it("needs slots 1 and 2, allows any number of people up to MAX_ASSIGNEES (e.g. 6+ people) and compacts optional slots", () => {
    expect(assigneeSlots(["7", "9"])).toEqual({ ok: true, assignees: [{ slot: 1, userId: "7" }, { slot: 2, userId: "9" }] });
    expect(assigneeSlots(["7", "9", "", null, "12"])).toEqual({
      ok: true,
      assignees: [{ slot: 1, userId: "7" }, { slot: 2, userId: "9" }, { slot: 3, userId: "12" }],
    });
    expect(assigneeSlots(["1", "2", "3", "4", "5", "6", "7"])).toEqual({
      ok: true,
      assignees: [
        { slot: 1, userId: "1" },
        { slot: 2, userId: "2" },
        { slot: 3, userId: "3" },
        { slot: 4, userId: "4" },
        { slot: 5, userId: "5" },
        { slot: 6, userId: "6" },
        { slot: 7, userId: "7" },
      ],
    });
  });

  it("rejects missing, duplicate or too many people", () => {
    expect(assigneeSlots(["7"])).toEqual({ ok: false, error: "first_two_required" });
    expect(assigneeSlots(["", "9", "12"])).toEqual({ ok: false, error: "first_two_required" });
    expect(assigneeSlots(["7", "7"])).toEqual({ ok: false, error: "duplicate" });
    expect(assigneeSlots(Array.from({ length: 51 }, (_, i) => String(i + 1)))).toEqual({ ok: false, error: "too_many" });
  });

  describe("per-person allocation (จ่ายงานรายคน)", () => {
    it("splits totalQty evenly, placing remainders in earlier slots", () => {
      expect(splitAssigneeTargets(40, 5)).toEqual([8, 8, 8, 8, 8]);
      expect(splitAssigneeTargets(40, 4)).toEqual([10, 10, 10, 10]);
      expect(splitAssigneeTargets(40, 3)).toEqual([14, 13, 13]);
      expect(splitAssigneeTargets(0, 3)).toEqual([]);
      expect(splitAssigneeTargets(40, 0)).toEqual([]);
    });

    it("validates targets: pool mode (all null) is allowed", () => {
      expect(validateAssigneeTargets([null, null, null], 3, 40)).toEqual({
        ok: true,
        targets: [null, null, null],
      });
      expect(validateAssigneeTargets([], 2, 40)).toEqual({
        ok: true,
        targets: [null, null],
      });
    });

    it("validates targets: custom allocation (e.g. 10, 10, 10, 5, 5 = 40)", () => {
      expect(validateAssigneeTargets([10, 10, 10, 5, 5], 5, 40)).toEqual({
        ok: true,
        targets: [10, 10, 10, 5, 5],
      });
    });

    it("rejects mismatched sums", () => {
      expect(validateAssigneeTargets([10, 10, 10, 5], 4, 40)).toEqual({
        ok: false,
        error: "target_qty_mismatch",
      });
      expect(validateAssigneeTargets([15, 15, 15], 3, 40)).toEqual({
        ok: false,
        error: "target_qty_mismatch",
      });
    });

    it("rejects invalid or incomplete targets when allocation is active", () => {
      expect(validateAssigneeTargets([10, 0, 30], 3, 40)).toEqual({
        ok: false,
        error: "invalid_target_qty",
      });
      expect(validateAssigneeTargets([10, null, 30], 3, 40)).toEqual({
        ok: false,
        error: "target_qty_incomplete",
      });
    });
  });
});

describe("checklistStatusOf (FR-PLAN-16, docs/03 §2.1)", () => {
  it("maps every plan status to exactly one checklist status", () => {
    for (const status of PLAN_STATUSES) {
      const owners = Object.values(CHECKLIST_STATUSES).filter((entry) => (entry.statuses as readonly string[]).includes(status));
      expect(owners, status).toHaveLength(1);
    }
    expect(checklistStatusOf("OPEN")).toBe("NOT_INSPECTED");
    expect(checklistStatusOf("ASSIGNED")).toBe("NOT_INSPECTED");
    expect(checklistStatusOf("QA_IN_PROGRESS")).toBe("QA");
    expect(checklistStatusOf("CANCELLED")).toBe("CANCELLED");
  });
});

describe("cancelBlock (BR-13)", () => {
  it("lets plan-open roles cancel before any result", () => {
    expect(cancelBlock({ status: "OPEN", qcDoneTotal: 0, isHead: false })).toBeNull();
    expect(cancelBlock({ status: "QC_IN_PROGRESS", qcDoneTotal: 0, isHead: false })).toBeNull();
  });

  it("needs a head once results exist", () => {
    expect(cancelBlock({ status: "QC_IN_PROGRESS", qcDoneTotal: 3, isHead: false })).toBe("head_only");
    expect(cancelBlock({ status: "QC_IN_PROGRESS", qcDoneTotal: 3, isHead: true })).toBeNull();
  });

  it("refuses statuses without a cancel arrow", () => {
    for (const status of ["ON_HOLD", "QA_LOT_REJECTED", "COMPLETED", "CANCELLED"] as const) {
      expect(cancelBlock({ status, qcDoneTotal: 0, isHead: true }), status).toBe("status");
    }
  });

  it("only flags live plans as waiting for goods", () => {
    expect(canFlagWaitingGoods("OPEN")).toBe(true);
    expect(canFlagWaitingGoods("COMPLETED")).toBe(false);
    expect(canFlagWaitingGoods("CANCELLED")).toBe(false);
  });
});

describe("workload gauge (docs/16 W10–W11)", () => {
  it("puts the team average at 50% and colours < 50 / 50–79 / ≥ 80", () => {
    const average = teamAverage([0, 2, 3, 4]);
    expect(average).toBe(2.25);
    expect([0, 2, 3, 4].map((open) => workloadOf(open, average))).toEqual([
      { percent: 0, level: "LOW", over: false },
      { percent: 44, level: "LOW", over: false },
      { percent: 67, level: "MID", over: false },
      { percent: 89, level: "HIGH", over: false },
    ]);
    expect(workloadOf(5, average)).toEqual({ percent: 111, level: "HIGH", over: true });
  });

  it("treats a quiet team's average as 1 so one work order isn't red", () => {
    expect(teamAverage([])).toBe(0);
    expect(workloadOf(1, 0.25)).toEqual({ percent: 50, level: "MID", over: false });
    expect(workloadOf(0, 0)).toEqual({ percent: 0, level: "LOW", over: false });
  });

  it("calculates workload with mode: max where 100% is the team maximum", () => {
    expect(teamMax([1, 2, 4])).toBe(4);
    expect(workloadOf(4, 4, { mode: "max" })).toEqual({ percent: 100, level: "HIGH", over: true });
    expect(workloadOf(2, 4, { mode: "max" })).toEqual({ percent: 50, level: "MID", over: false });
    expect(workloadOf(1, 4, { mode: "max" })).toEqual({ percent: 25, level: "LOW", over: false });
    expect(workloadOf(0, 4, { mode: "max" })).toEqual({ percent: 0, level: "LOW", over: false });
    expect(workloadOf(0, 0, { mode: "max" })).toEqual({ percent: 0, level: "LOW", over: false });
  });
});

describe("work-order guards (W4, W7)", () => {
  it("opens call-ins on live plans only", () => {
    expect(canOpenWorkOrder("OPEN")).toBe(true);
    expect(canOpenWorkOrder("QC_REVIEW")).toBe(true);
    for (const status of ["COMPLETED", "CANCELLED", "ON_HOLD"] as const) expect(canOpenWorkOrder(status)).toBe(false);
  });

  it("edits people while open, cancels only before results", () => {
    expect(workOrderBlock({ status: "IN_PROGRESS", qtyDone: 4 }, "assignees")).toBeNull();
    expect(workOrderBlock({ status: "IN_PROGRESS", qtyDone: 4 }, "cancel")).toBe("has_results");
    expect(workOrderBlock({ status: "RETURNED", qtyDone: 0 }, "cancel")).toBeNull();
    expect(workOrderBlock({ status: "SUBMITTED", qtyDone: 0 }, "assignees")).toBe("status");
  });
});

describe("planStatusLabel (docs/03 §2.1, history timeline)", () => {
  it("maps every PlanStatus to a distinct, non-empty label", () => {
    for (const status of PLAN_STATUSES) {
      expect(planStatusLabel(status)).toBeTruthy();
      expect(PLAN_STATUS_NAMES[status]).toBe(planStatusLabel(status));
    }
  });

  it("differentiates OPEN from ASSIGNED so transitions are never identical", () => {
    expect(planStatusLabel("OPEN")).toBe("เปิดแผน (รอจ่ายงาน)");
    expect(planStatusLabel("ASSIGNED")).toBe("มอบหมายงานแล้ว");
    expect(planStatusLabel("OPEN")).not.toBe(planStatusLabel("ASSIGNED"));
  });
});
