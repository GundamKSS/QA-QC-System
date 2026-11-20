import { describe, expect, it } from "vitest";
import {
  AQL_LEVELS,
  calculateAqlSample,
  isValidAqlLevel,
  STANDARD_AQL_TABLE,
} from "@/lib/qa/aql";

describe("AQL calculation rules (BR-03 & QC26 sheet)", () => {
  it("validates AQL levels", () => {
    for (const lvl of AQL_LEVELS) {
      expect(isValidAqlLevel(lvl)).toBe(true);
    }
    expect(isValidAqlLevel("INVALID")).toBe(false);
    expect(isValidAqlLevel(null)).toBe(false);
  });

  it("returns null when level is missing or lotQty is invalid", () => {
    expect(calculateAqlSample(null, 100)).toBeNull();
    expect(calculateAqlSample("NORMAL", 0)).toBeNull();
    expect(calculateAqlSample("NORMAL", -5)).toBeNull();
  });

  it("calculates REDUCED (ผ่อนคลาย) samples matching QC26 sheet", () => {
    expect(calculateAqlSample("REDUCED", 1)).toMatchObject({ codeLetter: "A", qaRequired: 1 });
    expect(calculateAqlSample("REDUCED", 2)).toMatchObject({ codeLetter: "A", qaRequired: 2 });
    expect(calculateAqlSample("REDUCED", 8)).toMatchObject({ codeLetter: "A", qaRequired: 2 });
    expect(calculateAqlSample("REDUCED", 12)).toMatchObject({ codeLetter: "B", qaRequired: 2 });
    expect(calculateAqlSample("REDUCED", 20)).toMatchObject({ codeLetter: "C", qaRequired: 2 });
    expect(calculateAqlSample("REDUCED", 35)).toMatchObject({ codeLetter: "D", qaRequired: 3 });
    expect(calculateAqlSample("REDUCED", 60)).toMatchObject({ codeLetter: "E", qaRequired: 5 });
    expect(calculateAqlSample("REDUCED", 120)).toMatchObject({ codeLetter: "F", qaRequired: 8 });
    expect(calculateAqlSample("REDUCED", 200)).toMatchObject({ codeLetter: "G", qaRequired: 13 });
    expect(calculateAqlSample("REDUCED", 350)).toMatchObject({ codeLetter: "H", qaRequired: 20 });
    expect(calculateAqlSample("REDUCED", 800)).toMatchObject({ codeLetter: "J", qaRequired: 32 });
    expect(calculateAqlSample("REDUCED", 2000)).toMatchObject({ codeLetter: "K", qaRequired: 50 });
  });

  it("calculates NORMAL (ปกติ) samples matching QC26 sheet", () => {
    expect(calculateAqlSample("NORMAL", 1)).toMatchObject({ codeLetter: "A", qaRequired: 1 });
    expect(calculateAqlSample("NORMAL", 6)).toMatchObject({ codeLetter: "A", qaRequired: 2 });
    expect(calculateAqlSample("NORMAL", 10)).toMatchObject({ codeLetter: "B", qaRequired: 3 });
    expect(calculateAqlSample("NORMAL", 20)).toMatchObject({ codeLetter: "C", qaRequired: 5 });
    expect(calculateAqlSample("NORMAL", 42)).toMatchObject({ codeLetter: "D", qaRequired: 8 });
    expect(calculateAqlSample("NORMAL", 70)).toMatchObject({ codeLetter: "E", qaRequired: 13 });
    expect(calculateAqlSample("NORMAL", 100)).toMatchObject({ codeLetter: "F", qaRequired: 20 });
    expect(calculateAqlSample("NORMAL", 250)).toMatchObject({ codeLetter: "G", qaRequired: 32 });
    expect(calculateAqlSample("NORMAL", 350)).toMatchObject({ codeLetter: "H", qaRequired: 50 });
    expect(calculateAqlSample("NORMAL", 1000)).toMatchObject({ codeLetter: "J", qaRequired: 80 });
    expect(calculateAqlSample("NORMAL", 2500)).toMatchObject({ codeLetter: "K", qaRequired: 125 });
  });

  it("calculates TIGHTENED (เคร่งครัด) samples matching QC26 sheet", () => {
    expect(calculateAqlSample("TIGHTENED", 1)).toMatchObject({ codeLetter: "A", qaRequired: 1 });
    expect(calculateAqlSample("TIGHTENED", 5)).toMatchObject({ codeLetter: "A", qaRequired: 2 });
    expect(calculateAqlSample("TIGHTENED", 15)).toMatchObject({ codeLetter: "B", qaRequired: 3 });
    expect(calculateAqlSample("TIGHTENED", 25)).toMatchObject({ codeLetter: "C", qaRequired: 5 });
    expect(calculateAqlSample("TIGHTENED", 50)).toMatchObject({ codeLetter: "D", qaRequired: 8 });
    expect(calculateAqlSample("TIGHTENED", 90)).toMatchObject({ codeLetter: "E", qaRequired: 13 });
    expect(calculateAqlSample("TIGHTENED", 150)).toMatchObject({ codeLetter: "F", qaRequired: 20 });
    expect(calculateAqlSample("TIGHTENED", 280)).toMatchObject({ codeLetter: "G", qaRequired: 32 });
    expect(calculateAqlSample("TIGHTENED", 500)).toMatchObject({ codeLetter: "H", qaRequired: 50 });
    expect(calculateAqlSample("TIGHTENED", 1200)).toMatchObject({ codeLetter: "J", qaRequired: 80 });
    expect(calculateAqlSample("TIGHTENED", 3200)).toMatchObject({ codeLetter: "K", qaRequired: 125 });
  });

  it("caps qaRequired at lotQty if sampleSize > lotQty and handles lots > 3200", () => {
    expect(calculateAqlSample("NORMAL", 5000, STANDARD_AQL_TABLE)).toMatchObject({
      codeLetter: "K",
      qaRequired: 125,
    });
  });
});
