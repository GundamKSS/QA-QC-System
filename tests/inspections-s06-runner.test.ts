import { describe, expect, it, vi } from "vitest";
import {
  QUICK_LOCATION_PRESETS,
  isLocationChipActive,
  parseLocationTokens,
  toggleLocationChip,
} from "@/components/inspections/DefectSelector";
import { HAPTIC_PATTERNS, triggerHaptic } from "@/lib/inspections/haptics";
import {
  areAllItemsDone,
  canJumpToStep,
  evalUnitResult,
  inferItemAnimationType,
  isItemDone,
  leaveBlockReason,
  maxUnlockedStepIndex,
  stepAdvanceBlockReason,
} from "@/lib/inspections/rules";
import type { InspectionItem, ItemAnswer } from "@/lib/inspections/types";

describe("Screen S06 & S07 - Checklist Runner & Summary Rules", () => {
  const normalItem: InspectionItem = {
    id: 1,
    seq: 1,
    topicCode: "CHK-01",
    title: "ระดับน้ำมันเครื่อง",
    inputType: "PASS_FAIL",
    isRequired: true,
    videoRule: "NONE",
  };

  const videoItem: InspectionItem = {
    id: 2,
    seq: 2,
    topicCode: "CHK-02",
    title: "การรั่วซึมและความดัน",
    inputType: "PASS_FAIL",
    isRequired: true,
    videoRule: "ON_FAIL",
  };

  it("leaveBlockReason enforces defect selection and photo evidence before leaving (AC FR-QC-04/05/06)", () => {
    // 1. Normal status -> no block
    expect(leaveBlockReason(normalItem, { status: "NORMAL" })).toBeNull();

    // 2. FAIL with no defect selected -> blocked
    const failNoDefect: ItemAnswer = { status: "FAIL", defects: [] };
    const reason1 = leaveBlockReason(normalItem, failNoDefect);
    expect(reason1).toContain("เลือกอาการอย่างน้อย 1 อาการ");

    // 3. FAIL with defect but no photo -> blocked
    const failWithDefect: ItemAnswer = {
      status: "FAIL",
      defects: [
        {
          defectId: 101,
          code: "DEF01",
          nameTh: "น้ำมันรั่ว",
          severity: "MAJOR",
          disposition: "REWORK",
        },
      ],
      photos: [],
    };
    const reason2 = leaveBlockReason(normalItem, failWithDefect);
    expect(reason2).toContain("ถ่ายรูปหลักฐานอย่างน้อย 1 รูป");

    // 4. FAIL with defect + photo -> can leave normal item
    const failSatisfied: ItemAnswer = {
      status: "FAIL",
      defects: [
        {
          defectId: 101,
          code: "DEF01",
          nameTh: "น้ำมันรั่ว",
          severity: "MAJOR",
          disposition: "REWORK",
        },
      ],
      photos: [{ uri: "photo.jpg", timestamp: new Date().toISOString() }],
    };
    expect(leaveBlockReason(normalItem, failSatisfied)).toBeNull();

    // 5. VideoItem when FAIL requires video as well
    const failMissingVideo: ItemAnswer = {
      status: "FAIL",
      defects: [
        {
          defectId: 101,
          code: "DEF01",
          nameTh: "รั่วซึมแรงดันสูง",
          severity: "MAJOR",
          disposition: "REWORK",
        },
      ],
      photos: [{ uri: "photo.jpg", timestamp: new Date().toISOString() }],
      video: null,
    };
    const reason3 = leaveBlockReason(videoItem, failMissingVideo);
    expect(reason3).toContain("ถ่ายวิดีโอ");
  });

  it("evalUnitResult computes outcomes for Screen S07 Summary Modal (BR-04)", () => {
    const items = [normalItem, videoItem];

    // Case A: All items Normal -> PASS
    const answersPass: Record<number, ItemAnswer> = {
      1: { status: "NORMAL" },
      2: { status: "NORMAL" },
    };
    const evalPass = evalUnitResult(items, answersPass);
    expect(evalPass.result).toBe("PASS");
    expect(evalPass.forcedAction).toBeNull();

    // Case B: Item 1 has CONCESSION defect -> CONCESSION
    const answersConcession: Record<number, ItemAnswer> = {
      1: {
        status: "FAIL",
        defects: [
          {
            defectId: 102,
            code: "DEF02",
            nameTh: "สีถลอกเล็กน้อย",
            severity: "MINOR",
            disposition: "CONCESSION",
          },
        ],
        photos: [{ uri: "p.jpg", timestamp: "..." }],
      },
      2: { status: "NORMAL" },
    };
    const evalConcession = evalUnitResult(items, answersConcession);
    expect(evalConcession.result).toBe("CONCESSION");

    // Case C: Critical defect with REJECT disposition -> NOT_PASSED, suggestedAction = REJECT, forcedAction = null
    const answersCritical: Record<number, ItemAnswer> = {
      1: { status: "NORMAL" },
      2: {
        status: "FAIL",
        defects: [
          {
            defectId: 103,
            code: "DEF03",
            nameTh: "ถังลมบุบร้าว",
            severity: "CRITICAL",
            disposition: "REJECT",
          },
        ],
        photos: [{ uri: "p.jpg", timestamp: "..." }],
        video: { uri: "v.mp4", durationSeconds: 5 },
      },
    };
    const evalCritical = evalUnitResult(items, answersCritical);
    expect(evalCritical.result).toBe("NOT_PASSED");
    expect(evalCritical.forcedAction).toBeNull();
    expect(evalCritical.suggestedAction).toBe("REJECT");
  });

  it("isItemDone accurately reflects item completion status", () => {
    expect(isItemDone(normalItem, null)).toBe(false);
    expect(isItemDone(normalItem, { status: null })).toBe(false);
    expect(isItemDone(normalItem, { status: "NORMAL" })).toBe(true);
    expect(isItemDone(normalItem, { status: "FAIL", defects: [] })).toBe(false);
  });

  it("enforces strict sequential 1-2-3 progression without skipping steps", () => {
    const step3: InspectionItem = {
      id: 3,
      seq: 3,
      topicCode: "CHK-03",
      title: "วัดแรงดันตัด (Bar)",
      inputType: "NUMBER",
      isRequired: true,
      videoRule: "NONE",
    };
    const steps = [normalItem, videoItem, step3];

    // Initially only step 0 (seq 1) is unlocked
    expect(maxUnlockedStepIndex(steps, {})).toBe(0);
    expect(stepAdvanceBlockReason(normalItem, {})).toContain("ห้ามข้ามขั้นตอน");

    // Trying to jump from step 0 to step 1 or 2 is blocked
    expect(canJumpToStep(steps, {}, 0, 1)).toEqual({
      allowed: false,
      reason: expect.stringContaining("ห้ามข้ามขั้นตอน"),
    });
    expect(canJumpToStep(steps, {}, 0, 2)).toEqual({
      allowed: false,
      reason: expect.stringContaining("ห้ามข้ามขั้นตอน"),
    });

    // After completing step 0, step 1 unlocks (but step 2 remains locked)
    const answersAfterStep1: Record<number, ItemAnswer> = {
      1: { status: "NORMAL" },
    };
    expect(maxUnlockedStepIndex(steps, answersAfterStep1)).toBe(1);
    expect(stepAdvanceBlockReason(normalItem, answersAfterStep1[1])).toBeNull();
    expect(canJumpToStep(steps, answersAfterStep1, 0, 1)).toEqual({ allowed: true });
    expect(canJumpToStep(steps, answersAfterStep1, 1, 2)).toEqual({
      allowed: false,
      reason: expect.stringContaining("ห้ามข้ามขั้นตอน"),
    });
    // Can always jump backward from step 1 to step 0
    expect(canJumpToStep(steps, answersAfterStep1, 1, 0)).toEqual({ allowed: true });
  });

  it("infers minimalist vector animation type for each step", () => {
    expect(inferItemAnimationType(normalItem)).toBe("AIR_TANK");
    expect(inferItemAnimationType(videoItem)).toBe("VALVE_LEAK");
    expect(
      inferItemAnimationType({
        ...normalItem,
        animationType: "SCAN_PUMP",
      }),
    ).toBe("SCAN_PUMP");
  });

  it("lets inspectors revisit completed steps and locks later steps again when an earlier answer needs evidence", () => {
    const thirdItem = { ...normalItem, id: 3, seq: 3 };
    const steps = [normalItem, videoItem, thirdItem];
    const completed: Record<number, ItemAnswer> = {
      1: { status: "NORMAL" },
      2: { status: "NORMAL" },
      3: { status: "NORMAL" },
    };
    expect(canJumpToStep(steps, completed, 2, 0)).toEqual({ allowed: true });
    expect(canJumpToStep(steps, completed, 0, 2)).toEqual({ allowed: true });

    const edited = { ...completed, 1: { status: "FAIL" as const, defects: [] } };
    expect(maxUnlockedStepIndex(steps, edited)).toBe(0);
    expect(canJumpToStep(steps, edited, 0, 2)).toEqual({
      allowed: false,
      reason: expect.stringContaining("เลือกอาการ"),
    });
    // Even the preceding step cannot bypass an unfinished failure on the current item.
    expect(canJumpToStep(steps, { ...completed, 2: { status: "FAIL" } }, 1, 0)).toEqual({
      allowed: false,
      reason: expect.stringContaining("ถ่ายรูปหลักฐาน"),
    });

    const corrected: Record<number, ItemAnswer> = {
      ...edited,
      1: {
        status: "FAIL",
        defects: [{ defectId: 101, code: "DEF01", nameTh: "สีถลอก", severity: "MINOR", disposition: "CONCESSION" }],
        photos: [{ uri: "evidence.jpg", timestamp: "2026-11-10T00:00:00Z" }],
      },
    };
    expect(maxUnlockedStepIndex(steps, corrected)).toBe(2);
    expect(canJumpToStep(steps, corrected, 0, 2)).toEqual({ allowed: true });
  });

  it("keeps the following step locked until required values and evidence are complete", () => {
    const numberItem: InspectionItem = {
      ...normalItem, inputType: "NUMBER", photoRule: "ALWAYS", videoRule: "ALWAYS",
    };
    const steps = [numberItem, videoItem];
    const answer: ItemAnswer = { value: "8", photos: [{ uri: "gauge.jpg", timestamp: "2026-11-10T00:00:00Z" }] };
    expect(canJumpToStep(steps, { 1: answer }, 0, 1).allowed).toBe(false);
    expect(canJumpToStep(steps, { 1: { ...answer, video: { uri: "gauge.mp4", durationSeconds: 5 } } }, 0, 1)).toEqual({ allowed: true });
    expect(canJumpToStep(steps, { 1: { ...answer, value: "" } }, 0, 1).allowed).toBe(false);
  });

  it("locks the next step when on FAIL item until confirmed with next button (maxUnlocked option)", () => {
    const steps = [normalItem, videoItem];
    const failAnswerWithEvidence: ItemAnswer = {
      status: "FAIL",
      defects: [{ defectId: 101, code: "DEF01", nameTh: "สีถลอก", severity: "MINOR", disposition: "CONCESSION" }],
      photos: [{ uri: "photo.jpg", timestamp: "2026-11-13T00:00:00Z" }],
    };
    const answers = { 1: failAnswerWithEvidence };

    // Before clicking Next on step 0, maxUnlocked is 0 (step 1 is locked)
    const checkBeforeNext = canJumpToStep(steps, answers, 0, 1, { maxUnlocked: 0 });
    expect(checkBeforeNext.allowed).toBe(false);
    if (!checkBeforeNext.allowed) {
      expect(checkBeforeNext.reason).toContain("กด \"ถัดไป\"");
    }

    // After clicking Next, maxUnlocked becomes 1
    const checkAfterNext = canJumpToStep(steps, answers, 0, 1, { maxUnlocked: 1 });
    expect(checkAfterNext.allowed).toBe(true);
  });

  it("supports N/A (Not Applicable) status with immediate completion and pass evaluation", () => {
    // 1. NA status counts as done without defects or photos
    const naAnswer: ItemAnswer = {
      status: "NA",
      defects: [],
      photos: [],
      video: null,
      remark: "N/A - ไม่มีชิ้นส่วนนี้ในรุ่นนี้",
    };
    expect(isItemDone(normalItem, naAnswer)).toBe(true);
    expect(isItemDone(videoItem, naAnswer)).toBe(true);
    expect(leaveBlockReason(normalItem, naAnswer)).toBeNull();
    expect(stepAdvanceBlockReason(normalItem, naAnswer)).toBeNull();

    // 2. Machine with mix of NORMAL and NA evaluates to PASS
    const steps = [normalItem, videoItem];
    const answers = {
      1: { status: "NORMAL" as const },
      2: naAnswer,
    };
    const evalResult = evalUnitResult(steps, answers);
    expect(evalResult.result).toBe("PASS");
    expect(evalResult.failedItems).toHaveLength(0);

    // 3. Step unlock gate recognizes NA as completed and unlocks next step
    expect(maxUnlockedStepIndex(steps, answers)).toBe(1);
    expect(canJumpToStep(steps, { 1: naAnswer }, 0, 1)).toEqual({ allowed: true });
  });

  it("toggles quick location preset chips cleanly while preserving custom typed notes", () => {
    expect(QUICK_LOCATION_PRESETS.length).toBeGreaterThanOrEqual(6);
    expect(parseLocationTokens("")).toEqual([]);

    // 1-tap select first chip
    const note1 = toggleLocationChip("", "ด้านหน้า");
    expect(note1).toBe("ด้านหน้า");
    expect(isLocationChipActive(note1, "ด้านหน้า")).toBe(true);
    expect(isLocationChipActive(note1, "ซ้าย")).toBe(false);

    // 1-tap add second chip
    const note2 = toggleLocationChip(note1, "ซ้าย");
    expect(note2).toBe("ด้านหน้า, ซ้าย");
    expect(isLocationChipActive(note2, "ด้านหน้า")).toBe(true);
    expect(isLocationChipActive(note2, "ซ้าย")).toBe(true);

    // 1-tap toggle off first chip
    const note3 = toggleLocationChip(note2, "ด้านหน้า");
    expect(note3).toBe("ซ้าย");
    expect(isLocationChipActive(note3, "ด้านหน้า")).toBe(false);

    // Works alongside custom free-text note
    const withCustom = toggleLocationChip("รอยยาว 2 ซม.", "ถังลม");
    expect(withCustom).toBe("รอยยาว 2 ซม., ถังลม");
  });

  it("prioritizes clean directional location presets for mobile screen compactness", () => {
    // Top 4 presets must be directional to avoid duplicating part names selected during defect picking
    const top4 = QUICK_LOCATION_PRESETS.slice(0, 4);
    expect(top4).toEqual(["ด้านหน้า", "ด้านหลัง", "ซ้าย", "ขวา"]);
  });

  it("areAllItemsDone detects when to auto-open Screen S07 Summary Modal immediately", () => {
    const steps = [normalItem, videoItem];
    expect(areAllItemsDone([], {})).toBe(false);
    expect(areAllItemsDone(steps, { 1: { status: "NORMAL" } })).toBe(false);
    expect(
      areAllItemsDone(steps, {
        1: { status: "NORMAL" },
        2: { status: "NA" },
      }),
    ).toBe(true);
  });

  it("triggers tactile haptic feedback patterns and respects prefers-reduced-motion", () => {
    const vibrateMock = vi.fn().mockReturnValue(true);
    const matchMediaMock = vi.fn().mockReturnValue({ matches: false });

    vi.stubGlobal("window", { matchMedia: matchMediaMock });
    vi.stubGlobal("navigator", { vibrate: vibrateMock });

    expect(triggerHaptic("tap")).toBe(true);
    expect(vibrateMock).toHaveBeenLastCalledWith(HAPTIC_PATTERNS.tap);

    expect(triggerHaptic("shutter")).toBe(true);
    expect(vibrateMock).toHaveBeenLastCalledWith(HAPTIC_PATTERNS.shutter);

    expect(triggerHaptic("warn")).toBe(true);
    expect(vibrateMock).toHaveBeenLastCalledWith(HAPTIC_PATTERNS.warn);

    expect(triggerHaptic("complete")).toBe(true);
    expect(vibrateMock).toHaveBeenLastCalledWith(HAPTIC_PATTERNS.complete);

    // Respects prefers-reduced-motion: reduce
    matchMediaMock.mockReturnValue({ matches: true });
    expect(triggerHaptic("tap")).toBe(false);

    vi.unstubAllGlobals();
  });
});
