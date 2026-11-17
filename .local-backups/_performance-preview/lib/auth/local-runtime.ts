import "server-only";
import { createSqlLocalStore } from "@/lib/db/local-users";
import { dbConfigured } from "@/lib/db/config";
import { createMemoryLocalStore, type LocalUserStore } from "./local-store";
import { createPinGuard, hashPin, type PinGuard } from "./pin";

type Runtime = { guard: PinGuard; dummyHash?: Promise<string>; store?: LocalUserStore };
const globalStore = globalThis as typeof globalThis & { __qcheckLocalAuth?: Runtime };

function runtime(): Runtime {
  return (globalStore.__qcheckLocalAuth ??= { guard: createPinGuard() });
}

/** The PIN pepper (docs/12 §2 R1), or null when it isn't configured — LOCAL logins are then unavailable. */
export function pinPepper(): string | null {
  const pepper = process.env.PIN_PEPPER;
  return pepper && pepper.length >= 32 ? pepper : null;
}

export function getPinGuard(): PinGuard {
  return runtime().guard;
}

/**
 * SQL Server when a database is configured; otherwise an empty in-memory store (no LOCAL users).
 * The SQL store is rebuilt on every call on purpose: it only holds closures (the connection pool
 * is cached in pool.ts), and caching it on globalThis kept serving the old code after a hot reload.
 * Only the in-memory store is cached, because it holds the data.
 */
export function getLocalStore(): LocalUserStore {
  if (dbConfigured()) return createSqlLocalStore();
  const state = runtime();
  state.store ??= createMemoryLocalStore();
  return state.store;
}

/** A real hash, computed once, that unknown codes are checked against. */
export function getDummyPinHash(pepper: string): Promise<string> {
  const state = runtime();
  state.dummyHash ??= hashPin("000000", pepper);
  return state.dummyHash;
}

