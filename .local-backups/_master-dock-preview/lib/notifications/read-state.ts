/** Device-local read receipts contain notification IDs only, scoped to the signed-in account. */
export function notificationReadKey(userId: string): string {
  return `qcheck:notification-reads:v1:${encodeURIComponent(userId)}`;
}

export function parseReadIds(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const value: unknown = JSON.parse(raw);
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

/** Drop receipts for work that is no longer actionable, so a later assignment can alert again. */
export function activeReadIds(readIds: ReadonlySet<string>, items: readonly { id: string }[]): Set<string> {
  return new Set(items.filter((item) => readIds.has(item.id)).map((item) => item.id));
}
