import Link from "next/link";
import { Suspense } from "react";
import { requirePageAccess } from "@/lib/auth/dal";
import { resolveActorId } from "@/lib/db/actor";
import { dbConfigured } from "@/lib/db/config";
import { dbProblem, dbProblemMessages, isDbError } from "@/lib/db/errors";
import { OPEN_WORK_ORDER_STATUSES, WORK_ORDER_STATUS_LABELS, WORK_ORDER_TYPE_LABELS } from "@/lib/plans/rules";
import { getPlanStore } from "@/lib/plans/runtime";
import type { JobCard } from "@/lib/plans/store";
import { dateText, QcBar } from "../plans/PlanBits";

export const metadata = { title: "งานของฉัน" };

type SearchParams = Record<string, string | string[] | undefined>;

export default function JobsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={<p className="p-6 text-ti-400">กำลังโหลด…</p>}>
      <Jobs searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * "งานของฉัน" (FR-JOB-03/04, docs/16 §5): work orders show up as soon as a QC Head picks the person —
 * no accept button (J4). QC Head sees everyone's by default and can narrow to their own (W6).
 */
async function Jobs({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageAccess("jobs", "/jobs");
  const isHead = user.roles.includes("QC_HEAD");
  const view = (await searchParams).view;
  const all = isHead && view !== "mine";

  let jobs: JobCard[];
  let me: string | null;
  try {
    me = dbConfigured() ? await resolveActorId(user.id) : user.id;
    if (all || me) {
      const store = getPlanStore();
      const actorId = all ? null : me;
      // Every active notification must have a card to open, even beyond the history's 200-row limit.
      const [active, recent] = await Promise.all([store.jobs(actorId, { activeOnly: true }), store.jobs(actorId)]);
      jobs = [...active, ...recent.filter((job) => !OPEN_WORK_ORDER_STATUSES.includes(job.status))];
    } else jobs = [];
  } catch (error) {
    if (!isDbError(error)) throw error;
    console.error("[db] jobs page failed", error.message);
    return (
      <Shell isHead={isHead} all={all}>
        <p role="alert" className="rounded-[10px] border border-red-500/50 bg-carbon-800 px-3 py-2 text-sm text-red-300">{dbProblemMessages[dbProblem(error)]}</p>
      </Shell>
    );
  }

  const open = jobs.filter((job) => OPEN_WORK_ORDER_STATUSES.includes(job.status));
  const done = jobs.filter((job) => !OPEN_WORK_ORDER_STATUSES.includes(job.status));

  return (
    <Shell isHead={isHead} all={all}>
      {!me && !all && <p role="alert" className="text-sm text-red-300">ไม่พบบัญชีของคุณในฐานข้อมูล QCheck — กรุณาออกจากระบบแล้วเข้าใหม่</p>}
      <section aria-labelledby="jobs-open" className="space-y-3">
        <h2 id="jobs-open" className="text-base font-medium text-ti-50">กำลังทำ ({open.length})</h2>
        {open.length === 0 ? (
          <p className="rounded-xl border border-dashed border-carbon-600 p-5 text-sm text-ti-400">{all ? "ยังไม่มีใบงานที่กำลังทำ" : "ยังไม่มีใบงานที่มอบให้คุณ"}</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {open.map((job) => <Card key={job.id} job={job} me={me} linkToPlan={isHead} />)}
          </ul>
        )}
      </section>
      {done.length > 0 && (
        <details className="space-y-3">
          <summary className="cursor-pointer text-sm text-ti-400 hover:text-ti-200">ส่งแล้ว / ปิดแล้ว ({done.length})</summary>
          <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {done.map((job) => <Card key={job.id} job={job} me={me} linkToPlan={isHead} />)}
          </ul>
        </details>
      )}
    </Shell>
  );
}

function Card({ job, me, linkToPlan }: { job: JobCard; me: string | null; linkToPlan: boolean }) {
  const others = job.assignees.filter((person) => person.userId !== me);
  const fix = job.type === "CALLIN_FIX";
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono font-semibold text-ti-50">{job.woNo}</span>
        <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${OPEN_WORK_ORDER_STATUSES.includes(job.status) ? "border-ember-500/60 text-ember-400" : "border-carbon-600 text-ti-400"}`}>
          {WORK_ORDER_STATUS_LABELS[job.status]}
        </span>
      </div>
      <p className="text-sm text-ti-200">
        {job.modelCode} · {job.docType === "PO" ? `PO ${job.docNo}` : job.docNo}
        <span className="block text-xs text-ti-400">{job.vendorName}{job.description ? ` · ${job.description}` : ""}</span>
      </p>
      <p className="text-xs text-ti-400">เรียกเข้า {job.calledQty.toLocaleString("th-TH")} เครื่อง · {dateText(job.calledDate)} · {WORK_ORDER_TYPE_LABELS[job.type]}</p>
      {fix ? (
        <p className="rounded-[10px] border border-ember-500/40 px-3 py-2 text-xs text-ember-400">เรียกเข้าแก้ไข — ไม่ต้องตรวจในแอป (ตรวจเพิ่มได้)</p>
      ) : (
        <div className="space-y-1">
          <p className="font-mono text-sm text-ti-200">ต้องตรวจ {job.qtyNeed} · ตรวจแล้ว {job.qtyDone}</p>
          <QcBar done={job.qtyDone} required={job.qtyNeed} />
        </div>
      )}
      <p className="text-xs text-ti-400">
        {me && job.assignees.some((person) => person.userId === me) ? (others.length ? `ร่วมกับ: ${others.map((person) => person.name).join(", ")}` : "") : `QC: ${job.assignees.map((person) => person.name).join(", ")}`}
      </p>
    </>
  );
  return (
    <li id={`work-order-${job.id}`} className="scroll-mt-20 space-y-2 app-panel rounded-xl border border-carbon-700 bg-carbon-800 p-4 target:border-ember-500">
      {linkToPlan ? (
        <Link href={`/plans/${job.planId}?tab=work`} className="block space-y-2 hover:opacity-90">{body}</Link>
      ) : (
        body
      )}
      {OPEN_WORK_ORDER_STATUSES.includes(job.status) && (
        <button type="button" disabled title="มาพร้อมโมดูลตรวจรายเครื่อง" className="h-11 w-full rounded-[10px] border border-carbon-600 text-sm text-ti-500">
          เริ่มตรวจ — มาพร้อมโมดูลตรวจ
        </button>
      )}
    </li>
  );
}

function Shell({ isHead, all, children }: { isHead: boolean; all: boolean; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl text-ti-50">{all ? "ใบงานทั้งหมด" : "งานของฉัน"}</h1>
          <p className="text-sm text-ti-400">ใบงานขึ้นทันทีที่หัวหน้าเลือกผู้ตรวจ — ไม่ต้องกดรับงาน</p>
        </div>
        {isHead && (
          <nav aria-label="มุมมอง" className="flex rounded-[12px] border border-carbon-600 bg-carbon-900 p-1 text-sm">
            <Link href="/jobs" aria-current={all ? "page" : undefined} className={`rounded-[10px] px-3 py-2 ${all ? "bg-carbon-700 text-ti-50" : "text-ti-400 hover:text-ti-200"}`}>ทั้งหมด</Link>
            <Link href="/jobs?view=mine" aria-current={all ? undefined : "page"} className={`rounded-[10px] px-3 py-2 ${all ? "text-ti-400 hover:text-ti-200" : "bg-carbon-700 text-ti-50"}`}>ของฉัน</Link>
          </nav>
        )}
      </header>
      {children}
    </div>
  );
}
