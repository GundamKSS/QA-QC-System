import { describe, expect, it } from "vitest";
import { checkLocalRoles, isLocalCode } from "@/lib/auth/local-users";

describe("isLocalCode", () => {
  it("accepts F + 4 or more digits, any case, and trims", () => {
    expect(isLocalCode("F0001")).toBe(true);
    expect(isLocalCode(" f12345 ")).toBe(true);
  });

  it("rejects central-style and malformed codes", () => {
    for (const code of ["TRW1001", "F001", "F00A1", "FF0001", "0001", ""]) expect(isLocalCode(code)).toBe(false);
  });
});

describe("checkLocalRoles", () => {
  it("keeps only field roles, in canonical order", () => {
    expect(checkLocalRoles(["QA_INSPECTOR", "QC_INSPECTOR"])).toEqual({ roles: ["QC_INSPECTOR", "QA_INSPECTOR"], rejected: [] });
  });

  it("rejects admin, heads and unknown codes instead of dropping them silently", () => {
    const result = checkLocalRoles(["QC_INSPECTOR", "ADMIN", "QC_HEAD", "BOSS"]);
    expect(result.roles).toEqual(["QC_INSPECTOR"]);
    expect(result.rejected.sort()).toEqual(["ADMIN", "BOSS", "QC_HEAD"]);
  });
});
