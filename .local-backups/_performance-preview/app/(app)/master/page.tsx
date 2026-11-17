import { Suspense } from "react";
import { MasterIndex } from "@/components/master/MasterIndex";
import { requirePageAccess } from "@/lib/auth/dal";
import { canAccessPage } from "@/lib/auth/page-access";
import { MASTERS } from "@/lib/master/registry";

export const metadata = { title: "ข้อมูลหลัก" };

/** What the index draws of each table; the rest of the registry stays on the server. */
const CARDS = MASTERS.map(({ slug, label, description }) => ({ slug, label, description }));

export default function MasterIndexPage() {
  return (
    <Suspense fallback={<p className="p-6 text-ti-400">กำลังโหลดข้อมูลหลัก…</p>}>
      <Master />
    </Suspense>
  );
}

/**
 * ข้อมูลหลัก. The role is checked here, on the server; the numbers on the cards are read by the browser from
 * `GET /api/master` (components/master).
 */
async function Master() {
  const user = await requirePageAccess("master", "/master");
  return <MasterIndex canEdit={canAccessPage(user.roles, "master-edit")} masters={CARDS} />;
}
