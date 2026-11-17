"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { bindExpandingSurface } from "@/components/dom/expandingSurface";

export function MasterHero({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => bindExpandingSurface(ref.current), []);
  return <section ref={ref} className="master-hero" aria-labelledby="master-title">{children}</section>;
}
