import Link from "next/link";
import type { ReactNode } from "react";
import { isAvailable } from "./nav";

/** Planned modules remain visible without sending people to missing pages. */
export function ShellLink({ href, children, className, ...props }: {
  href: string;
  children: ReactNode;
  className?: string;
  "aria-current"?: "page";
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
}) {
  if (!isAvailable(href)) {
    return <span role="link" aria-disabled="true" title="ส่วนนี้ยังไม่เปิดใช้งาน" className={`relative ${className ?? ""} cursor-default opacity-45`}>
      {children}<span className="sr-only"> — ยังไม่เปิดใช้งาน</span>
    </span>;
  }
  return <Link href={href} className={className} {...props}>{children}</Link>;
}
