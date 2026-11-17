"use client";

import { useState } from "react";

/**
 * Mobile: the filters beyond the search box sit behind a "ตัวกรอง" button (docs/15 §2).
 * ≥ 768 px they are always shown. Hidden inputs still submit with the form.
 */
export function MoreFilters({ active, children }: { active: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="plan-filters"
        onClick={() => setOpen((value) => !value)}
        className="h-11 rounded-[10px] border border-ti-600 px-4 text-sm text-ti-200 hover:border-ti-400 md:hidden"
      >
        ตัวกรอง{active > 0 && <span className="ml-1 rounded-full bg-ember-500 px-1.5 text-xs font-semibold text-carbon-900">{active}</span>}
      </button>
      <div id="plan-filters" className={`${open ? "grid" : "hidden"} w-full grid-cols-2 gap-3 md:flex md:w-auto md:flex-wrap md:items-end`}>
        {children}
      </div>
    </>
  );
}
