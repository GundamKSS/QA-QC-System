"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const DOCK_ENTER_PX = 50;
const DOCK_EXIT_PX = 28;

export function MasterBack({
  href = "/master",
  children,
  className = "master-back",
}: {
  href?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const [isDocked, setIsDocked] = useState(false);
  const [hasDockedOnce, setHasDockedOnce] = useState(false);

  useEffect(() => {
    const check = () => {
      const y = window.scrollY;
      setIsDocked((prev) => {
        if (!prev && y >= DOCK_ENTER_PX) {
          setHasDockedOnce(true);
          return true;
        }
        if (prev && y <= DOCK_EXIT_PX) {
          return false;
        }
        return prev;
      });
    };

    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check, { passive: true });
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  return (
    <Link
      href={href}
      className={className}
      data-docked={isDocked ? "true" : "false"}
      data-has-docked={hasDockedOnce ? "true" : "false"}
      tabIndex={isDocked ? -1 : 0}
      aria-hidden={isDocked}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m12 5-7 7 7 7M5 12h14" />
      </svg>
      <span>{children ?? "กลับไปข้อมูลหลัก"}</span>
    </Link>
  );
}
