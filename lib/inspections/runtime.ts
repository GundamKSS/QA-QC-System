import "server-only";
import { dbConfigured } from "@/lib/db/config";
import { createSqlInspectionStore } from "@/lib/db/inspections";
import { createMemoryInspectionStore, type InspectionStore } from "./store";

const globalStore = globalThis as typeof globalThis & {
  __qcheckInspectionStore?: InspectionStore;
};

/**
 * Returns SQL Server inspection store when DB is configured;
 * otherwise an in-memory inspection store for development/demo mode (lost on restart).
 */
export function getInspectionStore(): InspectionStore {
  if (globalStore.__qcheckInspectionStore) return globalStore.__qcheckInspectionStore;
  if (dbConfigured()) return createSqlInspectionStore();
  globalStore.__qcheckInspectionStore ??= createMemoryInspectionStore();
  return globalStore.__qcheckInspectionStore;
}

/** Override store during unit/integration tests. */
export function setInspectionStoreForTesting(store: InspectionStore | null): void {
  globalStore.__qcheckInspectionStore = store ?? undefined;
}
