import { describe, expect, it } from "vitest";
import {
  evalUnitResult,
  extractSerial,
  isItemDone,
  leaveBlockReason,
  missingEvidenceForItem,
  normalizeSerial,
  unansweredRequiredItems,
  validateSerial,
} from "@/lib/inspections/rules";
import type { InspectionItem, ItemAnswer, SelectedDefect } from "@/lib/inspections/types";

const mockItems: InspectionItem[] = [
  {
    id: 1,
    seq: 1,
    topicCode: "T01",
    title: "ตรวจสภาพภายนอกและสี",
    inputType: "PASS_FAIL",
    isRequired: true,
    videoRule: "NONE",
  },
  {
    id: 2,
    seq: 2,
    topicCode: "T02",
    title: "ทดสอบการเดินเครื่องและเสียง",
    inputType: "PASS_FAIL",
    isRequired: true,
    videoRule: "ALWAYS",
  },
  {
    id: 3,
    seq: 3,
    topicCode: "T03",
    title: "ตรวจสอบการรั่วซึมของลม",
    inputType: "PASS_FAIL",
    isRequired: true,
    videoRule: "ON_FAIL",
  },
  {
    id: 4,
    seq: 4,
    topicCode: "T04",
    title: "วัดแรงดันสูงสุด (Bar)",
    inputType: "NUMBER",
    isRequired: true,
    videoRule: "NONE",
  },
  {
    id: 5,
    seq: 5,
    topicCode: "T05",
    title: "หมายเหตุเพิ่มเติม",
    inputType: "TEXT",
    isRequired: false,
    videoRule: "NONE",
  },
];

const concessionDefect: SelectedDefect = {
  defectId: 101,
  code: "DEF00101",
  nameTh: "สีถลอกเล็กน้อยที่ขาถัง",
  severity: "MINOR",
  disposition: "CONCESSION",
};

const reworkDefect: SelectedDefect = {
  defectId: 102,
  code: "DEF00102",
  nameTh: "น็อตยึดพูลเลย์หลวม",
  severity: "MAJOR",
  disposition: "REWORK",
};

const rejectDefect: SelectedDefect = {
  defectId: 103,
  code: "DEF00103",
  nameTh: "เสื้อสูบร้าว",
  severity: "MAJOR",
  disposition: "REJECT",
};

const criticalRejectDefect: SelectedDefect = {
  defectId: 104,
  code: "DEF00104",
  nameTh: "ถังลมรั่วที่รอยเชื่อม",
  severity: "CRITICAL",
  disposition: "REJECT",
  requiresVideo: true,
};

const chooseDefect: SelectedDefect = {
  defectId: 105,
  code: "DEF00105",
  nameTh: "สายพานหย่อน",
  severity: "MINOR",
  disposition: "CHOOSE",
};

describe("evalUnitResult (BR-04)", () => {
  it("evaluates to PASS when all items are NORMAL", () => {
    const answers: Record<number, ItemAnswer> = {
      1: { status: "NORMAL" },
      2: { status: "NORMAL", video: { uri: "v1.mp4", durationSeconds: 10 } },
      3: { status: "NORMAL" },
    };
    const res = evalUnitResult(mockItems, answers);
    expect(res.result).toBe("PASS");
    expect(res.suggestedAction).toBeNull();
    expect(res.forcedAction).toBeNull();
    expect(res.failedItems).toHaveLength(0);
  });

  it("evaluates to CONCESSION when all defect findings carry CONCESSION disposition", () => {
    const answers: Record<number, ItemAnswer> = {
      1: {
        status: "FAIL",
        defects: [concessionDefect],
        photos: [{ uri: "p1.jpg", timestamp: "2026-11-09T00:00:00Z" }],
      },
      2: { status: "NORMAL", video: { uri: "v1.mp4", durationSeconds: 10 } },
    };
    const res = evalUnitResult(mockItems, answers);
    expect(res.result).toBe("CONCESSION");
    expect(res.suggestedAction).toBeNull();
    expect(res.forcedAction).toBeNull();
    expect(res.allDefects).toEqual([concessionDefect]);
  });

  it("evaluates to NOT_PASSED with suggested REWORK when defect carries REWORK disposition", () => {
    const answers: Record<number, ItemAnswer> = {
      1: {
        status: "FAIL",
        defects: [reworkDefect],
        photos: [{ uri: "p1.jpg", timestamp: "2026-11-09T00:00:00Z" }],
      },
    };
    const res = evalUnitResult(mockItems, answers);
    expect(res.result).toBe("NOT_PASSED");
    expect(res.suggestedAction).toBe("REWORK");
    expect(res.forcedAction).toBeNull();
  });

  it("evaluates to NOT_PASSED with suggested REJECT when defect carries REJECT disposition", () => {
    const answers: Record<number, ItemAnswer> = {
      1: {
        status: "FAIL",
        defects: [reworkDefect, rejectDefect],
        photos: [{ uri: "p1.jpg", timestamp: "2026-11-09T00:00:00Z" }],
      },
    };
    const res = evalUnitResult(mockItems, answers);
    expect(res.result).toBe("NOT_PASSED");
    expect(res.suggestedAction).toBe("REJECT");
    expect(res.forcedAction).toBeNull();
  });

  it("suggests REJECT but allows inspector autonomy (forcedAction is null) when a CRITICAL defect carries REJECT disposition", () => {
    const answers: Record<number, ItemAnswer> = {
      3: {
        status: "FAIL",
        defects: [criticalRejectDefect],
        photos: [{ uri: "p1.jpg", timestamp: "2026-11-09T00:00:00Z" }],
        video: { uri: "v2.mp4", durationSeconds: 15 },
      },
    };
    const res = evalUnitResult(mockItems, answers);
    expect(res.result).toBe("NOT_PASSED");
    expect(res.forcedAction).toBeNull();
    expect(res.suggestedAction).toBe("REJECT");
  });

  it("gives no automated suggestion when all defects have CHOOSE disposition", () => {
    const answers: Record<number, ItemAnswer> = {
      1: {
        status: "FAIL",
        defects: [chooseDefect],
        photos: [{ uri: "p1.jpg", timestamp: "2026-11-09T00:00:00Z" }],
      },
    };
    const res = evalUnitResult(mockItems, answers);
    expect(res.result).toBe("NOT_PASSED");
    expect(res.suggestedAction).toBeNull();
    expect(res.forcedAction).toBeNull();
  });

  it("always suggests REJECT when role is QA", () => {
    const answers: Record<number, ItemAnswer> = {
      1: {
        status: "FAIL",
        defects: [reworkDefect],
        photos: [{ uri: "p1.jpg", timestamp: "2026-11-09T00:00:00Z" }],
      },
    };
    const res = evalUnitResult(mockItems, answers, { role: "QA" });
    expect(res.result).toBe("NOT_PASSED");
    expect(res.suggestedAction).toBe("REJECT");
  });
});

describe("missingEvidenceForItem and isItemDone (BR-05)", () => {
  it("does not require photo or video when item status is NORMAL (Pass)", () => {
    const item = mockItems[1]; // videoRule: ALWAYS
    expect(missingEvidenceForItem(item, { status: "NORMAL" })).toHaveLength(0);
    expect(isItemDone(item, { status: "NORMAL" })).toBe(true);
  });

  it("requires defect and photo when item status is FAIL", () => {
    const item = mockItems[0]; // videoRule: NONE
    const missing = missingEvidenceForItem(item, { status: "FAIL" });
    expect(missing).toContain("เลือกอาการอย่างน้อย 1 อาการ");
    expect(missing).toContain("ถ่ายรูปหลักฐานอย่างน้อย 1 รูป");
    expect(isItemDone(item, { status: "FAIL" })).toBe(false);

    // After picking defect and photo:
    const completeAnswer: ItemAnswer = {
      status: "FAIL",
      defects: [concessionDefect],
      photos: [{ uri: "p.jpg", timestamp: "2026-11-09T00:00:00Z" }],
    };
    expect(missingEvidenceForItem(item, completeAnswer)).toHaveLength(0);
    expect(isItemDone(item, completeAnswer)).toBe(true);
  });

  it("requires video when item has videoRule ON_FAIL and status is FAIL", () => {
    const item = mockItems[2]; // videoRule: ON_FAIL
    const answerWithoutVideo: ItemAnswer = {
      status: "FAIL",
      defects: [reworkDefect],
      photos: [{ uri: "p.jpg", timestamp: "2026-11-09T00:00:00Z" }],
    };
    expect(missingEvidenceForItem(item, answerWithoutVideo)).toContain("ถ่ายวิดีโอสั้น ≤ 20 วินาที");
    expect(isItemDone(item, answerWithoutVideo)).toBe(false);

    const answerWithVideo: ItemAnswer = {
      ...answerWithoutVideo,
      video: { uri: "v.mp4", durationSeconds: 12 },
    };
    expect(missingEvidenceForItem(item, answerWithVideo)).toHaveLength(0);
    expect(isItemDone(item, answerWithVideo)).toBe(true);
  });

  it("requires video when a defect has requiresVideo true even if item videoRule is NONE", () => {
    const item = mockItems[0]; // videoRule: NONE
    const answerWithVideoDefect: ItemAnswer = {
      status: "FAIL",
      defects: [criticalRejectDefect], // requiresVideo: true
      photos: [{ uri: "p.jpg", timestamp: "2026-11-09T00:00:00Z" }],
    };
    expect(missingEvidenceForItem(item, answerWithVideoDefect)).toContain(
      "ถ่ายวิดีโอสั้น ≤ 20 วินาที",
    );
    expect(isItemDone(item, answerWithVideoDefect)).toBe(false);
  });

  it("validates NUMBER input items properly", () => {
    const item = mockItems[3]; // NUMBER, isRequired: true
    expect(isItemDone(item, undefined)).toBe(false);
    expect(isItemDone(item, { value: "" })).toBe(false);
    expect(isItemDone(item, { value: "abc" })).toBe(false);
    expect(isItemDone(item, { value: "8.5" })).toBe(true);
  });

  it("validates TEXT input items properly", () => {
    const item = mockItems[4]; // TEXT, isRequired: false
    expect(isItemDone(item, undefined)).toBe(true);
    expect(isItemDone(item, { value: "" })).toBe(true);
  });
});

describe("leaveBlockReason and unansweredRequiredItems", () => {
  it("blocks navigation from a failed item if defect or photo is missing", () => {
    const item = mockItems[0];
    const reason = leaveBlockReason(item, { status: "FAIL" });
    expect(reason).toContain("หัวข้อ 1");
    expect(reason).toContain("เลือกอาการอย่างน้อย 1 อาการ");
    expect(reason).toContain("ถ่ายรูปหลักฐานอย่างน้อย 1 รูป");

    const okReason = leaveBlockReason(item, {
      status: "FAIL",
      defects: [concessionDefect],
      photos: [{ uri: "p.jpg", timestamp: "2026-11-09T00:00:00Z" }],
    });
    expect(okReason).toBeNull();
  });

  it("identifies unanswered required items correctly", () => {
    const answers: Record<number, ItemAnswer> = {
      1: { status: "NORMAL" },
      // item 2 is FAIL but missing defect/photo/video evidence
      2: { status: "FAIL" },
      // item 3 is unanswered
      // item 4 is answered
      4: { value: "8.0" },
    };
    const unanswered = unansweredRequiredItems(mockItems, answers);
    expect(unanswered.map((i) => i.id)).toEqual([2, 3]);
  });
});

describe("validateSerial and extractSerial (BR-18)", () => {
  it("normalizes serials consistently", () => {
    expect(normalizeSerial(" sn-2610-001 ")).toBe("SN-2610-001");
    expect(normalizeSerial("  pum a 001  ")).toBe("PUMA001");
  });

  it("rejects empty or whitespace-only serials", () => {
    const res = validateSerial("   ", { existingSerials: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toBe("กรุณาระบุ Serial ปั๊ม");
  });

  it("rejects serials shorter than minimum length", () => {
    const res = validateSerial("123", { existingSerials: [], minLength: 4 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain("Serial สั้นเกินไป");
  });

  it("rejects serials already inspected in the plan", () => {
    const res = validateSerial("SN-2610-001", {
      existingSerials: ["SN-2610-001", "SN-2610-002"],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain("ได้รับการตรวจแล้วในแผนนี้");
  });

  it("accepts fresh valid serials", () => {
    const res = validateSerial("sn-2610-003", {
      existingSerials: ["SN-2610-001", "SN-2610-002"],
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.serial).toBe("SN-2610-003");
  });

  it("extracts serial from domestic pump QR code sticker string", () => {
    const qrSticker =
      "5x3 HP 260L. (PP-23P) + MOTOR|FG1004-000675|WC:WMT-409|MODEL:PP-23P|FIC:FG-MT-00156|Date:2569/10/22|WO1274/69|SN69/00014-15";
    expect(extractSerial(qrSticker)).toBe("SN69/00014-15");
  });

  it("extracts plain serial without modification", () => {
    expect(extractSerial("SN-998877")).toBe("SN-998877");
  });
});
