"use client";

import { useState } from "react";
import { CentralUsersPermissions } from "./CentralUsersPermissions";
import { UsersView } from "./UsersView";
import type { FieldRole } from "./UserAdminForms";

type Props = {
  canManage: boolean;
  canGrantDev: boolean;
  fieldRoles: FieldRole[];
};

/**
 * Minimalist segmented tabs for `/admin/users`:
 * - Admin / Dev see Central Users (default) & Field PIN Users.
 * - QC Head / QA Head see Field PIN Users directly.
 */
export function UsersManagementTabs({ canManage, canGrantDev, fieldRoles }: Props) {
  const [tab, setTab] = useState<"central" | "local">(canManage ? "central" : "local");

  if (!canManage) {
    return <UsersView canManage={false} fieldRoles={fieldRoles} />;
  }

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="ประเภทผู้ใช้"
        className="inline-flex rounded-full bg-carbon-950/90 p-1 border border-carbon-700/70 gap-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "central"}
          onClick={() => setTab("central")}
          className={`h-9 rounded-full px-4 text-sm font-medium transition-all cursor-pointer ${
            tab === "central"
              ? "bg-carbon-800 text-ti-50 shadow-sm ring-1 ring-carbon-700/60"
              : "text-ti-400 hover:text-ti-100"
          }`}
        >
          ผู้ใช้ระบบกลาง
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "local"}
          onClick={() => setTab("local")}
          className={`h-9 rounded-full px-4 text-sm font-medium transition-all cursor-pointer ${
            tab === "local"
              ? "bg-carbon-800 text-ti-50 shadow-sm ring-1 ring-carbon-700/60"
              : "text-ti-400 hover:text-ti-100"
          }`}
        >
          ผู้ใช้หน้างาน (PIN)
        </button>
      </div>

      {tab === "central" ? (
        <CentralUsersPermissions canGrantDev={canGrantDev} />
      ) : (
        <UsersView canManage={canManage} fieldRoles={fieldRoles} />
      )}
    </div>
  );
}
