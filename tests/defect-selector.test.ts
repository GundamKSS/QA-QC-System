import { describe, expect, it } from "vitest";
import {
  COMMON_STANDARD_DEFECTS,
  QUICK_LOCATION_PRESETS,
  STANDARD_DEFECT_PARTS,
  defectKey,
  defectMatches,
  isLocationChipActive,
  parseLocationTokens,
  toggleLocationChip,
} from "@/components/inspections/DefectSelector";
import { missingEvidenceForItem, syncDefectPhotos } from "@/lib/inspections/rules";
import type { InspectionItem, ItemAnswer, SelectedDefect } from "@/lib/inspections/types";

describe("DefectSelector - Symptom-first ➔ Part-second UX Architecture", () => {
  const sampleDefects: SelectedDefect[] = [
    {
      defectId: 101,
      code: "DEF101",
      nameTh: "สีถลอก / รอยขีดข่วน",
      part: "ฝาสูบ",
      severity: "MINOR",
      disposition: "CONCESSION",
    },
    {
      defectId: 102,
      code: "DEF102",
      nameTh: "สีถลอก / รอยขีดข่วน",
      part: "ถังลม",
      severity: "MINOR",
      disposition: "CONCESSION",
    },
    {
      defectId: 103,
      code: "DEF103",
      nameTh: "สีถลอก / รอยขีดข่วน",
      part: "ตัวถัง/ฐาน",
      severity: "MINOR",
      disposition: "CONCESSION",
    },
    {
      defectId: 104,
      code: "DEF104",
      nameTh: "พบการรั่วซึม (ลม / น้ำมัน)",
      part: "ข้อต่อ/วาล์ว",
      severity: "MAJOR",
      disposition: "REWORK",
    },
    {
      defectId: 105,
      code: "DEF105",
      nameTh: "น็อตยึดหรือชิ้นส่วนประกอบหลวม",
      part: "แท่นมอเตอร์",
      severity: "MAJOR",
      disposition: "REWORK",
    },
  ];

  it("exports standard fallback defects and presets", () => {
    expect(COMMON_STANDARD_DEFECTS.length).toBeGreaterThanOrEqual(5);
    expect(QUICK_LOCATION_PRESETS).toContain("ด้านหน้า");
    expect(QUICK_LOCATION_PRESETS).toContain("ถังลม");
  });

  it("accurately matches defects by itemDefectId or defectId + part", () => {
    const a: SelectedDefect = {
      defectId: 1,
      itemDefectId: 99,
      code: "D1",
      nameTh: "ทดสอบ",
      part: "A",
      severity: "MINOR",
      disposition: "REWORK",
    };
    const b: SelectedDefect = {
      defectId: 1,
      itemDefectId: 99,
      code: "D1",
      nameTh: "ทดสอบ",
      part: "B", // different part but same itemDefectId
      severity: "MINOR",
      disposition: "REWORK",
    };
    expect(defectMatches(a, b)).toBe(true);

    const c: SelectedDefect = {
      defectId: 2,
      code: "D2",
      nameTh: "ทดสอบ",
      part: "A",
      severity: "MINOR",
      disposition: "REWORK",
    };
    const d: SelectedDefect = {
      defectId: 2,
      code: "D2",
      nameTh: "ทดสอบ",
      part: "A",
      severity: "MINOR",
      disposition: "REWORK",
    };
    const e: SelectedDefect = {
      defectId: 2,
      code: "D2",
      nameTh: "ทดสอบ",
      part: "B",
      severity: "MINOR",
      disposition: "REWORK",
    };
    expect(defectMatches(c, d)).toBe(true);
    expect(defectMatches(c, e)).toBe(false);
  });

  it("does not match a standard fallback part (itemDefectId null) with a specific itemDefect on another part", () => {
    const templateDefect: SelectedDefect = {
      defectId: 3,
      itemDefectId: 101,
      code: "DEF00003",
      nameTh: "สีถลอก",
      part: "สายระบาย",
      severity: "MINOR",
      disposition: "CONCESSION",
    };
    const fallbackPartDefect: SelectedDefect = {
      defectId: 3,
      itemDefectId: null,
      code: "DEF00003",
      nameTh: "สีถลอก",
      part: "ถัง",
      severity: "MINOR",
      disposition: "CONCESSION",
    };
    expect(defectMatches(templateDefect, fallbackPartDefect)).toBe(false);
  });

  it("generates deterministic defect keys for both itemDefects and standard defects", () => {
    const itemDefect: SelectedDefect = {
      itemDefectId: 42,
      defectId: 1,
      code: "D1",
      nameTh: "ทดสอบ",
      part: "A",
      severity: "MINOR",
      disposition: "REWORK",
    };
    expect(defectKey(itemDefect)).toBe("item-defect-42");

    const standardDefect: SelectedDefect = {
      defectId: 12,
      code: "D12",
      nameTh: "ทดสอบ",
      part: "ถังลม",
      severity: "MINOR",
      disposition: "REWORK",
    };
    expect(defectKey(standardDefect)).toBe(JSON.stringify([12, "ถังลม"]));
  });

  it("handles multi-token location note parsing and toggling cleanly", () => {
    expect(parseLocationTokens(null)).toEqual([]);
    expect(parseLocationTokens("")).toEqual([]);
    expect(parseLocationTokens(" ด้านหน้า , ขวา ")).toEqual(["ด้านหน้า", "ขวา"]);

    const note1 = toggleLocationChip("", "ด้านหน้า");
    expect(note1).toBe("ด้านหน้า");
    expect(isLocationChipActive(note1, "ด้านหน้า")).toBe(true);
    expect(isLocationChipActive(note1, "ซ้าย")).toBe(false);

    const note2 = toggleLocationChip(note1, "ซ้าย");
    expect(note2).toBe("ด้านหน้า, ซ้าย");
    expect(isLocationChipActive(note2, "ซ้าย")).toBe(true);

    const note3 = toggleLocationChip(note2, "ด้านหน้า");
    expect(note3).toBe("ซ้าย");
  });

  it("unifies identical symptom names while preserving all part variants", () => {
    // When grouping sampleDefects by nameTh:
    const uniqueSymptoms = new Set(sampleDefects.map((d) => d.nameTh.trim()));
    // 3 unique symptoms ("สีถลอก / รอยขีดข่วน", "พบการรั่วซึม (ลม / น้ำมัน)", "น็อตยึดหรือชิ้นส่วนประกอบหลวม")
    expect(uniqueSymptoms.size).toBe(3);

    // "สีถลอก / รอยขีดข่วน" groups 3 distinct parts together
    const scratchVariants = sampleDefects.filter(
      (d) => d.nameTh === "สีถลอก / รอยขีดข่วน",
    );
    expect(scratchVariants.length).toBe(3);
    const parts = scratchVariants.map((d) => d.part);
    expect(parts).toContain("ฝาสูบ");
    expect(parts).toContain("ถังลม");
    expect(parts).toContain("ตัวถัง/ฐาน");
  });

  it("exports STANDARD_DEFECT_PARTS including 'ถัง', 'ฐาน', and 'แขนจับ'", () => {
    expect(STANDARD_DEFECT_PARTS).toContain("ถัง");
    expect(STANDARD_DEFECT_PARTS).toContain("ฐาน");
    expect(STANDARD_DEFECT_PARTS).toContain("แขนจับ");
    expect(STANDARD_DEFECT_PARTS).toContain("หัวปั๊ม/ฝาสูบ");
    expect(STANDARD_DEFECT_PARTS).toContain("มอเตอร์");
  });

  it("binds photos directly to a defect ID and syncs with syncDefectPhotos", () => {
    const defectWithPhoto: SelectedDefect = {
      defectId: 102,
      code: "DEF00008",
      nameTh: "น็อตยึดหรือชิ้นส่วนประกอบหลวม",
      part: "ฐาน",
      severity: "MAJOR",
      disposition: "REWORK",
      photos: [
        {
          id: "photo-1",
          uri: "data:image/jpeg;base64,base-screw-photo",
          timestamp: "2026-11-13T10:00:00Z",
          defectId: 102,
          part: "ฐาน",
        },
      ],
    };

    expect(defectWithPhoto.photos).toHaveLength(1);
    expect(defectWithPhoto.photos![0].defectId).toBe(102);
    expect(defectWithPhoto.photos![0].part).toBe("ฐาน");

    const synced = syncDefectPhotos([defectWithPhoto]);
    expect(synced).toHaveLength(1);
    expect(synced[0].defectId).toBe(102);
    expect(synced[0].part).toBe("ฐาน");
  });

  it("missingEvidenceForItem requires photo evidence for each selected defect when FAIL", () => {
    const item: InspectionItem = {
      id: 1,
      seq: 1,
      topicCode: "CHK-01",
      title: "ตรวจสภาพภายนอกและสี",
      inputType: "PASS_FAIL",
      isRequired: true,
      videoRule: "NONE",
    };

    const defectWithoutPhoto: SelectedDefect = {
      defectId: 5,
      code: "DEF00003",
      nameTh: "สีถลอก / รอยขีดข่วนภายนอก",
      part: "ถัง",
      severity: "MINOR",
      disposition: "CONCESSION",
      photos: [],
    };

    const answerWithoutPhoto: ItemAnswer = {
      status: "FAIL",
      defects: [defectWithoutPhoto],
      photos: [],
    };

    const missing = missingEvidenceForItem(item, answerWithoutPhoto);
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.some((m) => m.includes("ถ่ายรูปหลักฐาน") && m.includes("จุดที่พบ"))).toBe(true);

    // After taking the mandatory spot photo:
    const defectWithSpotPhoto: SelectedDefect = {
      ...defectWithoutPhoto,
      photos: [
        {
          id: "p1",
          uri: "tank-scratch.jpg",
          timestamp: "2026-11-13T12:00:00Z",
          defectId: 5,
          part: "ถัง",
        },
      ],
    };

    const answerWithPhoto: ItemAnswer = {
      status: "FAIL",
      defects: [defectWithSpotPhoto],
      photos: syncDefectPhotos([defectWithSpotPhoto]),
    };

    expect(missingEvidenceForItem(item, answerWithPhoto)).toHaveLength(0);
  });
});
