"use client";

import { AppBack } from "@/components/ui/AppBack";
import type { ReactNode } from "react";

export function MasterBack({
  href = "/master",
  children,
  className = "master-back",
}: {
  href?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <AppBack href={href} className={className}>
      {children ?? "กลับไปข้อมูลหลัก"}
    </AppBack>
  );
}
