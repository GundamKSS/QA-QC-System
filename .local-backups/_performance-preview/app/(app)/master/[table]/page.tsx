import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MasterTableView } from "@/components/master/MasterTableView";
import { requirePageAccess } from "@/lib/auth/dal";
import { canAccessPage } from "@/lib/auth/page-access";
import { masterBySlug } from "@/lib/master/registry";
import { parseMasterTableQuery, type MasterTableQuery } from "@/lib/master/table-query";

export const metadata = { title: "ข้อมูลหลัก" };

export default function MasterTablePage({ params, searchParams }: { params: Promise<{ table: string }>; searchParams: Promise<MasterTableQuery> }) {
  return (
    <Suspense fallback={<p className="p-6 text-ti-400">กำลังโหลด…</p>}>
      <MasterTable params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * One master table. The role and the table are checked here, on the server, and the address is parsed here;
 * the rows are read by the browser from `GET /api/master/<table>` (components/master).
 */
async function MasterTable({ params, searchParams }: { params: Promise<{ table: string }>; searchParams: Promise<MasterTableQuery> }) {
  const { table } = await params;
  const def = masterBySlug(table);
  if (!def) notFound();
  const user = await requirePageAccess("master", `/master/${def.slug}`);
  return <MasterTableView def={def} canEdit={canAccessPage(user.roles, "master-edit")} values={parseMasterTableQuery(await searchParams)} />;
}
