/**
 * Pure AQL calculation rules and standard table definitions from Google Sheet 'QC26 แผนQC'
 * (Sheets: AQLผ่อนคลาย, AQLปกติ, AQLเคร่งครัด, เคสผ่อนคลาย).
 */

export const AQL_LEVELS = ["REDUCED", "NORMAL", "TIGHTENED"] as const;
export type AqlLevel = (typeof AQL_LEVELS)[number];

export const AQL_LEVEL_LABELS: Record<AqlLevel, string> = {
  REDUCED: "ผ่อนคลาย (Reduced)",
  NORMAL: "ปกติ (Normal)",
  TIGHTENED: "เคร่งครัด (Tightened)",
};

export const AQL_LEVEL_SHORT_LABELS: Record<AqlLevel, string> = {
  REDUCED: "ผ่อนคลาย",
  NORMAL: "ปกติ",
  TIGHTENED: "เคร่งครัด",
};

export type AqlRuleRow = {
  level: AqlLevel;
  lotMin: number;
  lotMax: number;
  codeLetter: string;
  sampleSize: number;
  ac: number;
  re: number;
};

/**
 * Standard AQL Table from Google Sheet 'QC26 แผนQC' (matches db/026_aql_and_qa_work_orders.sql).
 */
export const STANDARD_AQL_TABLE: readonly AqlRuleRow[] = [
  // REDUCED (ผ่อนคลาย)
  { level: "REDUCED", lotMin: 1, lotMax: 1, codeLetter: "A", sampleSize: 1, ac: 0, re: 1 },
  { level: "REDUCED", lotMin: 2, lotMax: 8, codeLetter: "A", sampleSize: 2, ac: 0, re: 1 },
  { level: "REDUCED", lotMin: 9, lotMax: 15, codeLetter: "B", sampleSize: 2, ac: 0, re: 1 },
  { level: "REDUCED", lotMin: 16, lotMax: 25, codeLetter: "C", sampleSize: 2, ac: 0, re: 1 },
  { level: "REDUCED", lotMin: 26, lotMax: 50, codeLetter: "D", sampleSize: 3, ac: 0, re: 1 },
  { level: "REDUCED", lotMin: 51, lotMax: 90, codeLetter: "E", sampleSize: 5, ac: 0, re: 1 },
  { level: "REDUCED", lotMin: 91, lotMax: 150, codeLetter: "F", sampleSize: 8, ac: 0, re: 1 },
  { level: "REDUCED", lotMin: 151, lotMax: 280, codeLetter: "G", sampleSize: 13, ac: 0, re: 1 },
  { level: "REDUCED", lotMin: 281, lotMax: 500, codeLetter: "H", sampleSize: 20, ac: 1, re: 2 },
  { level: "REDUCED", lotMin: 501, lotMax: 1200, codeLetter: "J", sampleSize: 32, ac: 1, re: 2 },
  { level: "REDUCED", lotMin: 1201, lotMax: 3200, codeLetter: "K", sampleSize: 50, ac: 2, re: 3 },

  // NORMAL (ปกติ)
  { level: "NORMAL", lotMin: 1, lotMax: 1, codeLetter: "A", sampleSize: 1, ac: 0, re: 1 },
  { level: "NORMAL", lotMin: 2, lotMax: 8, codeLetter: "A", sampleSize: 2, ac: 0, re: 1 },
  { level: "NORMAL", lotMin: 9, lotMax: 15, codeLetter: "B", sampleSize: 3, ac: 0, re: 1 },
  { level: "NORMAL", lotMin: 16, lotMax: 25, codeLetter: "C", sampleSize: 5, ac: 0, re: 1 },
  { level: "NORMAL", lotMin: 26, lotMax: 50, codeLetter: "D", sampleSize: 8, ac: 0, re: 1 },
  { level: "NORMAL", lotMin: 51, lotMax: 90, codeLetter: "E", sampleSize: 13, ac: 0, re: 1 },
  { level: "NORMAL", lotMin: 91, lotMax: 150, codeLetter: "F", sampleSize: 20, ac: 1, re: 2 },
  { level: "NORMAL", lotMin: 151, lotMax: 280, codeLetter: "G", sampleSize: 32, ac: 1, re: 2 },
  { level: "NORMAL", lotMin: 281, lotMax: 500, codeLetter: "H", sampleSize: 50, ac: 2, re: 3 },
  { level: "NORMAL", lotMin: 501, lotMax: 1200, codeLetter: "J", sampleSize: 80, ac: 3, re: 4 },
  { level: "NORMAL", lotMin: 1201, lotMax: 3200, codeLetter: "K", sampleSize: 125, ac: 5, re: 6 },

  // TIGHTENED (เคร่งครัด)
  { level: "TIGHTENED", lotMin: 1, lotMax: 1, codeLetter: "A", sampleSize: 1, ac: 0, re: 1 },
  { level: "TIGHTENED", lotMin: 2, lotMax: 8, codeLetter: "A", sampleSize: 2, ac: 0, re: 1 },
  { level: "TIGHTENED", lotMin: 9, lotMax: 15, codeLetter: "B", sampleSize: 3, ac: 0, re: 1 },
  { level: "TIGHTENED", lotMin: 16, lotMax: 25, codeLetter: "C", sampleSize: 5, ac: 0, re: 1 },
  { level: "TIGHTENED", lotMin: 26, lotMax: 50, codeLetter: "D", sampleSize: 8, ac: 0, re: 1 },
  { level: "TIGHTENED", lotMin: 51, lotMax: 90, codeLetter: "E", sampleSize: 13, ac: 0, re: 1 },
  { level: "TIGHTENED", lotMin: 91, lotMax: 150, codeLetter: "F", sampleSize: 20, ac: 0, re: 1 },
  { level: "TIGHTENED", lotMin: 151, lotMax: 280, codeLetter: "G", sampleSize: 32, ac: 1, re: 2 },
  { level: "TIGHTENED", lotMin: 281, lotMax: 500, codeLetter: "H", sampleSize: 50, ac: 1, re: 2 },
  { level: "TIGHTENED", lotMin: 501, lotMax: 1200, codeLetter: "J", sampleSize: 80, ac: 2, re: 3 },
  { level: "TIGHTENED", lotMin: 1201, lotMax: 3200, codeLetter: "K", sampleSize: 125, ac: 3, re: 4 },
];

export type AqlCalculationResult = {
  level: AqlLevel;
  codeLetter: string;
  sampleSize: number;
  qaRequired: number;
  ac: number;
  re: number;
};

export function isValidAqlLevel(value: unknown): value is AqlLevel {
  return typeof value === "string" && (AQL_LEVELS as readonly string[]).includes(value);
}

/**
 * Looks up the AQL rule for a given level and lot quantity (BR-03).
 * If lotQty exceeds the highest row in the table (e.g. > 3200), uses the highest range row for that level.
 */
export function calculateAqlSample(
  level: AqlLevel | null | undefined,
  lotQty: number,
  table: readonly AqlRuleRow[] = STANDARD_AQL_TABLE,
): AqlCalculationResult | null {
  if (!level || !isValidAqlLevel(level) || !Number.isFinite(lotQty) || lotQty < 1) {
    return null;
  }

  const levelRows = table
    .filter((r) => r.level === level)
    .sort((a, b) => a.lotMin - b.lotMin);

  if (levelRows.length === 0) return null;

  const matched =
    levelRows.find((r) => lotQty >= r.lotMin && lotQty <= r.lotMax) ??
    (lotQty > levelRows[levelRows.length - 1].lotMax
      ? levelRows[levelRows.length - 1]
      : levelRows[0]);

  const qaRequired = Math.min(matched.sampleSize, lotQty);

  return {
    level,
    codeLetter: matched.codeLetter,
    sampleSize: matched.sampleSize,
    qaRequired,
    ac: matched.ac,
    re: matched.re,
  };
}
