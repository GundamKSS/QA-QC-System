/** Different entry/exit gaps keep the filter row steady at the header boundary. */
export function shouldDockMasterFilters(docked: boolean, anchorTop: number, headerBottom: number): boolean {
  if (!Number.isFinite(anchorTop) || !Number.isFinite(headerBottom)) return docked;
  const gap = anchorTop - headerBottom;
  return docked ? gap < 28 : gap <= 8;
}
