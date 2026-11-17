import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ModelChecklistConfiguratorView } from "@/components/master/ModelChecklistConfiguratorView";
import { requirePageAccess } from "@/lib/auth/dal";
import { canAccessPage } from "@/lib/auth/page-access";

export const metadata = {
  title: "จัดลำดับเช็คลิสต์ | ข้อมูลหลัก",
};

export default function MasterTableItemDetailPage({
  params,
}: {
  params: Promise<{ table: string; id: string }>;
}) {
  return (
    <Suspense fallback={<p className="p-6 text-ti-400">กำลังโหลด…</p>}>
      <MasterTableItemDetailContent params={params} />
    </Suspense>
  );
}

async function MasterTableItemDetailContent({
  params,
}: {
  params: Promise<{ table: string; id: string }>;
}) {
  const { table, id } = await params;
  if (table !== "checklist-templates") {
    notFound();
  }
  const templateId = Number(id);
  if (!Number.isInteger(templateId) || templateId <= 0) {
    notFound();
  }

  const user = await requirePageAccess("master", `/master/checklist-templates/${templateId}`);
  const canEdit =
    canAccessPage(user.roles, "master-edit") ||
    user.roles.includes("ADMIN") ||
    user.roles.includes("QC_HEAD") ||
    user.roles.includes("QA_HEAD");

  return (
    <ModelChecklistConfiguratorView
      canEdit={canEdit}
      initialTemplateId={templateId}
    />
  );
}
