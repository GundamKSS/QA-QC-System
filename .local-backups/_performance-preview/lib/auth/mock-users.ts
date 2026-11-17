import type { Affiliation, Role } from "./types";

/**
 * Seed users for the mock auth adapter (Pass 1, docs/07 §14 L2).
 * Test data only — names are fictional. The adapter hashes these passwords with scrypt
 * at startup; the real backend will store `password_hash` only (docs/03 `users`).
 */
export const MOCK_PASSWORD = "Qcheck-Test-2026";

export type MockUserSeed = {
  id: string;
  employeeCode: string;
  fullName: string;
  department: string;
  affiliation: Affiliation;
  roles: Role[];
  password: string;
  mustChangePassword: boolean;
  isActive: boolean;
};

export const mockUsers: MockUserSeed[] = [
  {
    id: "u-qc-1001",
    employeeCode: "TRW1001",
    fullName: "สมชาย ใจดี",
    department: "QC",
    affiliation: "TRW",
    roles: ["QC_INSPECTOR"],
    password: MOCK_PASSWORD,
    mustChangePassword: false,
    isActive: true,
  },
  {
    id: "u-qa-2001",
    employeeCode: "TRW2001",
    fullName: "วิภาวรรณ ศรีสุข",
    department: "QA",
    affiliation: "TRW",
    roles: ["QA_HEAD", "QA_INSPECTOR", "MASTER_ADMIN"],
    password: MOCK_PASSWORD,
    mustChangePassword: false,
    isActive: true,
  },
  {
    // First login → forced password change (FR-AUTH-02).
    id: "u-puma-3001",
    employeeCode: "PUMA3001",
    fullName: "อนุชา แก้วมณี",
    department: "408",
    affiliation: "PUMA",
    roles: ["QC_INSPECTOR"],
    password: MOCK_PASSWORD,
    mustChangePassword: true,
    isActive: true,
  },
  {
    // Deactivated (resigned) user — history stays, login is refused (FR-AUTH-06).
    id: "u-qc-9001",
    employeeCode: "TRW9001",
    fullName: "ปรีชา ทองดี",
    department: "QC",
    affiliation: "TRW",
    roles: ["QC_INSPECTOR"],
    password: MOCK_PASSWORD,
    mustChangePassword: false,
    isActive: false,
  },
  {
    id: "u-admin-0001",
    employeeCode: "ADM0001",
    fullName: "ผู้ดูแลระบบ",
    department: "IT",
    affiliation: "TRW",
    roles: ["ADMIN"],
    password: MOCK_PASSWORD,
    mustChangePassword: false,
    isActive: true,
  },
];
