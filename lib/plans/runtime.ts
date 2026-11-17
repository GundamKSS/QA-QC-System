import "server-only";
import { dbConfigured } from "@/lib/db/config";
import { createSqlPlanStore } from "@/lib/db/plans";
import { mockUsers } from "@/lib/auth/mock-users";
import { createMemoryPlanStore, DEMO_MASTER, type PlanStore } from "./store";

const globalStore = globalThis as typeof globalThis & { __qcheckPlanStore?: PlanStore };

/**
 * SQL Server when a database is configured; otherwise an in-memory store with a few demo
 * vendors/models and the mock QC Inspectors as assignees (lost on restart). Same caching rule as auth/local-runtime.ts: only the
 * memory store is cached, because it holds the data.
 */
export function getPlanStore(): PlanStore {
  if (dbConfigured()) return createSqlPlanStore();
  globalStore.__qcheckPlanStore ??= createMemoryPlanStore({
    ...DEMO_MASTER,
    inspectors: mockUsers
      .filter((user) => user.roles.includes("QC_INSPECTOR"))
      .map((user) => ({ id: user.id, code: user.employeeCode, name: user.fullName, isActive: user.isActive })),
  });
  return globalStore.__qcheckPlanStore;
}
