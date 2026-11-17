"use client";

import { useEffect } from "react";

/**
 * Pages restored from the browser's back/forward cache (e.g. Back after signing out) are
 * reloaded, so the server re-checks the session instead of showing the previous user's name
 * or a spent login form. Mounted once in the root layout so every page is covered.
 */
export function BfcacheGuard() {
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);
  return null;
}
