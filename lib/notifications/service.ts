import "server-only";
import { canAccessPage } from "@/lib/auth/page-access";
import type { SessionUser } from "@/lib/auth/types";
import { resolveActorId } from "@/lib/db/actor";
import { dbConfigured } from "@/lib/db/config";
import { getPool } from "@/lib/db/pool";
import { getPlanStore } from "@/lib/plans/runtime";
import type { PlanStore } from "@/lib/plans/store";
import { loadNotificationReads, type NotificationReadStore } from "./read-store";
import type { NotificationSnapshot, WorkNotification } from "./types";
import { workNotifications } from "./work";

type NotificationDependencies = {
  store: Pick<PlanStore, "jobs">;
  resolveUserId: (sessionId: string) => Promise<string | null>;
  readStore?: Pick<NotificationReadStore, "load">;
};

async function loadHandoverNotifications(user: SessionUser): Promise<WorkNotification[]> {
  if (!dbConfigured()) return [];
  const isAdmin = user.roles.includes("ADMIN");
  const isQcHead = user.roles.includes("QC_HEAD") || isAdmin;
  const isQaHead = user.roles.includes("QA_HEAD") || isAdmin;
  if (!isQcHead && !isQaHead) return [];

  try {
    const pool = await getPool();
    const res = await pool.request().query<{
      plan_id: number;
      plan_no: string;
      status: string;
      model_code: string;
      qa_accepted_at: Date | null;
      qa_accepted_by_name: string | null;
      qa_confirmed_at: Date | null;
      qa_confirmed_by_name: string | null;
      submitted_at: Date | null;
      rework_count: number;
    }>(`
      SELECT TOP (25)
        p.id AS plan_id,
        p.plan_no,
        p.status,
        m.code AS model_code,
        p.qa_accepted_at,
        acc.full_name AS qa_accepted_by_name,
        p.qa_confirmed_at,
        conf.full_name AS qa_confirmed_by_name,
        (
          SELECT TOP (1) psh.at
            FROM dbo.plan_status_history psh
           WHERE psh.plan_id = p.id AND psh.to_status = 'QA_PENDING'
           ORDER BY psh.id DESC
        ) AS submitted_at,
        (
          SELECT COUNT(*)
            FROM dbo.unit_inspections ui
           WHERE ui.plan_id = p.id
             AND ui.status = 'COMPLETED'
             AND ui.result = 'NOT_PASSED'
             AND ui.action = 'REWORK'
             AND NOT EXISTS (
               SELECT 1 FROM dbo.unit_inspections child
                WHERE child.parent_inspection_id = ui.id
                  AND child.status IN ('COMPLETED', 'IN_PROGRESS')
             )
        ) AS rework_count
      FROM dbo.plans p
      JOIN dbo.models m ON m.id = p.model_id
      LEFT JOIN dbo.users acc ON acc.id = p.qa_accepted_by
      LEFT JOIN dbo.users conf ON conf.id = p.qa_confirmed_by
      WHERE p.status IN ('QA_PENDING', 'QA_IN_PROGRESS')
         OR (p.status = 'COMPLETED' AND p.qa_confirmed_at >= DATEADD(day, -3, SYSUTCDATETIME()))
      ORDER BY p.updated_at DESC
    `);

    const items: WorkNotification[] = [];
    for (const r of res.recordset) {
      if (isQaHead && r.status === "QA_PENDING") {
        const at = r.submitted_at ? new Date(r.submitted_at).toISOString() : new Date().toISOString();
        items.push({
          id: `qa-handover:pending:${r.plan_id}`,
          workOrderId: `${r.plan_no}-QA`,
          kind: "qa_handover",
          status: "IN_PROGRESS",
          title: "มีแผนตรวจใหม่จาก QC รอรับงาน",
          body: `${r.plan_no} · ${r.model_code} · กดรับงานและจ่ายงานให้ผู้ตรวจ QA`,
          href: `/qa-queue?plan=${r.plan_id}`,
          createdAt: at,
          woNo: `${r.plan_no}-QA`,
          modelCode: r.model_code,
          calledDate: at.slice(0, 10),
          qtyNeed: 0,
          qtyDone: 0,
          type: "QA",
        });
      }

      if (isQcHead && r.qa_accepted_at && r.status === "QA_IN_PROGRESS") {
        const at = new Date(r.qa_accepted_at).toISOString();
        items.push({
          id: `qa-handover:accepted:${r.plan_id}:${at.slice(0, 19)}`,
          workOrderId: `${r.plan_no}-QA`,
          kind: "qa_handover",
          status: "IN_PROGRESS",
          title: "ฝ่าย QA รับงานแล้ว",
          body: `แผน ${r.plan_no} (${r.model_code}) · รับงานโดย ${r.qa_accepted_by_name ?? "Head QA"}`,
          href: `/plans/${r.plan_id}`,
          createdAt: at,
          woNo: `${r.plan_no}-QA`,
          modelCode: r.model_code,
          calledDate: at.slice(0, 10),
          qtyNeed: 0,
          qtyDone: 0,
          type: "QA",
        });
      }

      if (isQcHead && Number(r.rework_count) > 0 && r.status === "QA_IN_PROGRESS") {
        items.push({
          id: `qa-handover:rework:${r.plan_id}:${r.rework_count}`,
          workOrderId: `${r.plan_no}-QA`,
          kind: "returned",
          status: "RETURNED",
          title: "มีเครื่องจาก QA ส่งกลับมาให้ QC แก้ไข",
          body: `แผน ${r.plan_no} (${r.model_code}) · รอแก้ไขเฉพาะข้อที่ไม่ผ่าน ${r.rework_count} เครื่อง`,
          href: `/plans/${r.plan_id}?tab=inspections`,
          createdAt: new Date().toISOString(),
          woNo: `${r.plan_no}-QA`,
          modelCode: r.model_code,
          calledDate: new Date().toISOString().slice(0, 10),
          qtyNeed: Number(r.rework_count),
          qtyDone: 0,
          type: "QA",
        });
      }

      if (isQcHead && r.qa_confirmed_at && r.status === "COMPLETED") {
        const at = new Date(r.qa_confirmed_at).toISOString();
        items.push({
          id: `qa-handover:confirmed:${r.plan_id}`,
          workOrderId: `${r.plan_no}-QA`,
          kind: "qa_handover",
          status: "IN_PROGRESS",
          title: "ฝ่าย QA ยืนยันผลตรวจเรียบร้อยแล้ว",
          body: `แผน ${r.plan_no} (${r.model_code}) · ยืนยันปิดแผนโดย ${r.qa_confirmed_by_name ?? "Head QA"}`,
          href: `/plans/${r.plan_id}`,
          createdAt: at,
          woNo: `${r.plan_no}-QA`,
          modelCode: r.model_code,
          calledDate: at.slice(0, 10),
          qtyNeed: 0,
          qtyDone: 0,
          type: "QA",
        });
      }
    }
    return items;
  } catch {
    return [];
  }
}

/** The caller supplies the verified session user; identity is never accepted from a request parameter. */
export async function getWorkNotifications(user: SessionUser, dependencies?: NotificationDependencies): Promise<NotificationSnapshot> {
  const empty = { userId: user.id, items: [], total: 0 };
  const hasJobs = canAccessPage(user.roles, "jobs");
  const hasQaQueue = canAccessPage(user.roles, "qa-queue");
  if (user.mustChangePassword || (!hasJobs && !hasQaQueue)) return empty;

  const resolveUserId = dependencies?.resolveUserId ?? (async (id: string) => dbConfigured() ? resolveActorId(id) : id);
  const actorId = await resolveUserId(user.id);
  // Never pass null to jobs(): null deliberately means everyone's work for the QC Head page.
  if (!actorId) return empty;

  const store = dependencies?.store ?? getPlanStore();
  const items: WorkNotification[] = [];

  if (hasJobs) {
    const jobs = await store.jobs(actorId, { activeOnly: true });
    items.push(...workNotifications(jobs.filter((job) => job.assignees.some((person) => person.userId === actorId))));
  }

  if (hasQaQueue && !dependencies) {
    const qaJobs = await store.jobs(actorId, { activeOnly: true, side: "QA" });
    items.push(...workNotifications(qaJobs.filter((job) => job.assignees.some((person) => person.userId === actorId))));
  }

  if (!dependencies) {
    const handovers = await loadHandoverNotifications(user);
    items.push(...handovers);
  }

  const readLoader = dependencies ? dependencies.readStore?.load : loadNotificationReads;
  if (readLoader) {
    const readState = await readLoader(actorId);
    return {
      userId: user.id,
      items,
      total: items.length,
      readIds: readState.readIds,
      history: readState.history,
      synced: readState.synced,
    };
  }

  return { userId: user.id, items, total: items.length };
}
