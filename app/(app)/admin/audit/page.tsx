import type { Metadata } from "next";
import { Suspense } from "react";
import { AuditLogView } from "@/components/audit/AuditLogView";
import { CardsSkeleton } from "@/components/feedback/CardsSkeleton";
import { parseAuditQuery } from "@/lib/audit/query";
import { requirePageAccess } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "ประวัติการใช้งานระบบ (Audit Log)",
};

type AuditSearch = Promise<Record<string, string | string[] | undefined>>;

export default function AuditLogPage({ searchParams }: { searchParams: AuditSearch }) {
  return (
    <Suspense fallback={<div className="p-6"><CardsSkeleton label="กำลังโหลดประวัติการใช้งานระบบ" /></div>}>
      <AuditContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AuditContent({ searchParams }: { searchParams: AuditSearch }) {
  await requirePageAccess("audit", "/admin/audit");
  const query = parseAuditQuery(await searchParams);
  return <AuditLogView key={JSON.stringify(query)} query={query} />;
}
