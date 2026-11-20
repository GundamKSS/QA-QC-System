"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppBack } from "@/components/ui/AppBack";
import { CardsSkeleton } from "@/components/feedback/CardsSkeleton";
import { LoadError } from "@/components/feedback/LoadError";
import { StartInspectionModal, type WorkOrderInfo } from "@/components/inspections/StartInspectionModal";
import { QcBar } from "@/components/plans/PlanBits";
import { WorkOrderIcon } from "@/components/plans/WorkOrderIcon";
import { splitAssigneeTargets } from "@/lib/plans/rules";
import type { Inspector } from "@/lib/plans/store";
import {
  AQL_LEVEL_LABELS,
  AQL_LEVEL_SHORT_LABELS,
  calculateAqlSample,
  type AqlLevel,
} from "@/lib/qa/aql";
import type {
  QaAssigneeProgress,
  QaFailedUnitItem,
  QaQueueItem,
  QaQueuePayload,
} from "@/lib/qa/queue";

type FilterKey =
  | "all"
  | "rework"
  | "pending"
  | "in_progress"
  | "ready_confirm"
  | "missing_aql"
  | "completed";

export function QaQueueView({ forceView }: { forceView?: "all" | "mine" } = {}) {
  const [data, setData] = useState<QaQueuePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [viewMode, setViewMode] = useState<"all" | "mine" | null>(null);
  const [inspectingJob, setInspectingJob] = useState<WorkOrderInfo | null>(null);
  const [aqlEditingItem, setAqlEditingItem] = useState<QaQueueItem | null>(null);
  const [assigningItem, setAssigningItem] = useState<QaQueueItem | null>(null);
  const [confirmingItem, setConfirmingItem] = useState<QaQueueItem | null>(null);
  const [acceptingItem, setAcceptingItem] = useState<QaQueueItem | null>(null);

  const fetchQueue = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/qa-queue");
      if (!res.ok) {
        throw new Error(`โหลดข้อมูลคิว QA ไม่สำเร็จ (รหัส ${res.status})`);
      }
      const json = await res.json();
      setData(json.data ?? json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการโหลดคิว QA");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    void (async () => {
      try {
        const res = await fetch("/api/qa-queue");
        if (!res.ok) {
          throw new Error(`โหลดข้อมูลคิว QA ไม่สำเร็จ (รหัส ${res.status})`);
        }
        const json = await res.json();
        if (!ignore) {
          const payload: QaQueuePayload = json.data ?? json;
          setError(null);
          setData(payload);
          setViewMode((prev) => prev ?? (payload.isHead ? "all" : "mine"));
        }
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการโหลดคิว QA");
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  const effectiveView = viewMode ?? forceView ?? (data?.isHead ? "all" : "mine");
  const me = data?.me ?? null;
  const isHead = data?.isHead ?? false;

  const visibleQueue = useMemo(() => {
    if (!data?.queue) return [];
    if (effectiveView === "all" || !me) return data.queue;
    return data.queue.filter(
      (item) =>
        item.assignees.some((a) => String(a.userId) === String(me)) ||
        item.failedUnits.some((u) => String(u.inspectorId) === String(me)),
    );
  }, [data, effectiveView, me]);

  const filteredQueue = useMemo(() => {
    if (activeFilter === "all") return visibleQueue;
    if (activeFilter === "rework") {
      return visibleQueue.filter((item) => item.failedUnits.length > 0);
    }
    if (activeFilter === "pending") {
      return visibleQueue.filter(
        (item) => item.status === "QA_PENDING" || item.status === "QC_COMPLETED",
      );
    }
    if (activeFilter === "in_progress") {
      return visibleQueue.filter((item) => item.status === "QA_IN_PROGRESS");
    }
    if (activeFilter === "ready_confirm") {
      return visibleQueue.filter(
        (item) =>
          item.status === "QA_IN_PROGRESS" &&
          item.hasAql &&
          item.qaRequired > 0 &&
          item.qaDoneTotal >= item.qaRequired &&
          item.qaReworkPending === 0,
      );
    }
    if (activeFilter === "missing_aql") {
      return visibleQueue.filter((item) => !item.hasAql && item.status !== "COMPLETED");
    }
    if (activeFilter === "completed") {
      return visibleQueue.filter((item) => item.status === "COMPLETED");
    }
    return visibleQueue;
  }, [visibleQueue, activeFilter]);

  function handleStartQaInspection(item: QaQueueItem) {
    if (!item.hasAql || !item.qaWorkOrderId) {
      setAqlEditingItem(item);
      return;
    }
    setInspectingJob({
      id: item.qaWorkOrderId,
      woNo: item.qaWorkOrderNo ?? `${item.planNo}-QA`,
      planId: item.id,
      modelCode: `${item.brandName} ${item.modelCode}`,
      description: item.modelDescription,
      qtyNeed: item.qaRequired,
      qtyDone: item.qaDoneTotal,
      vendorName: item.vendorName,
      role: "QA",
    });
  }

  const chips = useMemo(() => {
    if (!data) return [];
    const pendingCnt = visibleQueue.filter(
      (item) => item.status === "QA_PENDING" || item.status === "QC_COMPLETED",
    ).length;
    const inProgressCnt = visibleQueue.filter((item) => item.status === "QA_IN_PROGRESS").length;
    const readyCnt = visibleQueue.filter(
      (item) =>
        item.status === "QA_IN_PROGRESS" &&
        item.hasAql &&
        item.qaRequired > 0 &&
        item.qaDoneTotal >= item.qaRequired &&
        item.qaReworkPending === 0,
    ).length;
    const reworkCnt = visibleQueue.reduce((sum, item) => sum + item.failedUnits.length, 0);
    const doneCnt = visibleQueue.filter((item) => item.status === "COMPLETED").length;
    const missingCnt = visibleQueue.filter((item) => !item.hasAql && item.status !== "COMPLETED").length;

    const list: { key: FilterKey; label: string; count: number; badgeClass?: string }[] = [
      { key: "all", label: "ทั้งหมด", count: visibleQueue.length },
    ];
    if (reworkCnt > 0) {
      list.push({
        key: "rework",
        label: "งานที่ต้อง rework",
        count: reworkCnt,
        badgeClass: "text-ti-50 bg-fail/30 border border-fail/60 font-semibold",
      });
    }
    if (missingCnt > 0) {
      list.push({
        key: "missing_aql",
        label: "ไม่มี AQL",
        count: missingCnt,
        badgeClass: "text-ti-50 bg-fail/30 border border-fail/60 font-semibold",
      });
    }
    if (isHead || pendingCnt > 0) {
      list.push({
        key: "pending",
        label: "รอรับงาน",
        count: pendingCnt,
        badgeClass:
          pendingCnt > 0
            ? "text-amber-300 bg-amber-500/15 border border-amber-500/30"
            : undefined,
      });
    }
    list.push({
      key: "in_progress",
      label: "กำลังตรวจ",
      count: inProgressCnt,
      badgeClass:
        inProgressCnt > 0
          ? "text-emerald-300 bg-emerald-500/15 border border-emerald-500/30"
          : undefined,
    });
    if (isHead && readyCnt > 0) {
      list.push({
        key: "ready_confirm",
        label: "รอยืนยันผล",
        count: readyCnt,
        badgeClass: "text-cyan-300 bg-cyan-500/15 border border-cyan-500/30",
      });
    }
    list.push({
      key: "completed",
      label: "เสร็จแล้ว",
      count: doneCnt,
      badgeClass: "text-ti-400 bg-carbon-800 border border-carbon-700",
    });
    return list;
  }, [data, visibleQueue, isHead]);

  return (
    <div className="min-w-0 w-full space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl text-ti-50">
            {effectiveView === "all" ? (isHead ? "แผนงานสุ่มตรวจ QA" : "งาน QA ทั้งหมด") : "งานสุ่มตรวจ QA ของฉัน"}
          </h1>
          <p className="text-sm text-ti-400">
            {effectiveView === "all"
              ? "รับงานจาก QC · จ่ายงานผู้ตรวจ QA ตามยอดล็อต AQL · ติดตามความคืบหน้าและยืนยันผล"
              : "ใบงานสุ่มตรวจ QA ที่ได้รับมอบหมาย · กดทำใบงานและตรวจเช็กลิสต์"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isHead && (
            <nav
              aria-label="มุมมอง"
              className="flex rounded-panel border border-carbon-600 bg-carbon-900 p-1 text-xs"
            >
              <button
                type="button"
                onClick={() => setViewMode("all")}
                aria-current={effectiveView === "all" ? "page" : undefined}
                className={`rounded-control px-3 py-1.5 cursor-pointer ${
                  effectiveView === "all"
                    ? "bg-carbon-700 text-ti-50 font-medium"
                    : "text-ti-400 hover:text-ti-200"
                }`}
              >
                ทั้งหมด
              </button>
              <button
                type="button"
                onClick={() => setViewMode("mine")}
                aria-current={effectiveView === "mine" ? "page" : undefined}
                className={`rounded-control px-3 py-1.5 cursor-pointer ${
                  effectiveView === "mine"
                    ? "bg-carbon-700 text-ti-50 font-medium"
                    : "text-ti-400 hover:text-ti-200"
                }`}
              >
                ของฉัน
              </button>
            </nav>
          )}
          <Link
            href="/master/aql-table"
            className="inline-flex h-9 items-center rounded-control border border-carbon-600 bg-carbon-800 px-3 text-xs font-medium text-ti-200 hover:border-carbon-500 hover:text-ti-50"
          >
            ตาราง AQL
          </Link>
          <button
            type="button"
            onClick={() => void fetchQueue()}
            disabled={loading}
            className="inline-flex h-9 items-center rounded-control border border-carbon-600 bg-carbon-800 px-3 text-xs font-medium text-ti-200 hover:border-carbon-500 hover:text-ti-50 disabled:opacity-50 cursor-pointer"
          >
            {loading ? "กำลังโหลด…" : "รีเฟรช"}
          </button>
        </div>
      </header>

      {error && <LoadError message={error} onRetry={() => void fetchQueue()} />}

      {!data ? (
        !error && <CardsSkeleton label="กำลังโหลดคิวงาน QA" />
      ) : (
        <div
          aria-busy={loading}
          className={`space-y-5 transition-opacity ${loading ? "opacity-60" : ""}`}
        >
          <AppBack href="/home">กลับหน้าหลัก</AppBack>

          {data.missingAqlCount > 0 && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-fail/40 bg-fail/10 px-4 py-3 text-sm text-ti-100"
            >
              <span>มี {data.missingAqlCount} แผนที่โมเดลยังไม่ได้ตั้งค่า AQL</span>
              <button
                type="button"
                onClick={() =>
                  setActiveFilter((prev) => (prev === "missing_aql" ? "all" : "missing_aql"))
                }
                className="font-medium text-ember-400 hover:text-ember-300 hover:underline cursor-pointer"
              >
                {activeFilter === "missing_aql" ? "แสดงทั้งหมด" : "ดูรายการที่ไม่มี AQL"}
              </button>
            </div>
          )}

          {/* Quick Filter Chips Bar */}
          <nav
            aria-label="กรองสถานะคิวงาน"
            className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-none -mx-1 px-1"
          >
            {chips.map((chip) => {
              const isActive = activeFilter === chip.key;
              const isAlert = chip.key === "missing_aql" || chip.key === "rework";
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setActiveFilter(chip.key)}
                  className={`shrink-0 inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-xs font-medium transition-all border cursor-pointer ${
                    isActive
                      ? isAlert
                        ? "border-fail bg-fail/20 text-ti-50 shadow-sm font-semibold"
                        : "border-ember-500 bg-carbon-700 text-ti-50 shadow-sm"
                      : "border-carbon-700 bg-carbon-800/80 text-ti-300 hover:border-carbon-600 hover:text-ti-100"
                  }`}
                >
                  <span>{chip.label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[11px] font-mono font-semibold ${
                      chip.badgeClass ||
                      (isActive ? "bg-ember-500/20 text-ember-300" : "bg-carbon-900 text-ti-400")
                    }`}
                  >
                    {chip.count}
                  </span>
                </button>
              );
            })}
          </nav>

          {filteredQueue.length === 0 ? (
            <p className="rounded-panel border border-dashed border-carbon-600 p-5 text-sm text-ti-400">
              {effectiveView === "mine"
                ? "คุณยังไม่มีใบงานสุ่มตรวจ QA ที่ได้รับมอบหมายในหมวดนี้"
                : activeFilter === "all"
                  ? "ไม่มีรายการรอสุ่มตรวจ QA"
                  : "ไม่มีรายการในหมวดนี้"}
            </p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredQueue.map((item) => (
                <QueueCard
                  key={item.id}
                  item={item}
                  me={me}
                  isHead={isHead}
                  accepting={acceptingItem?.id === item.id}
                  onAccept={() => setAcceptingItem(item)}
                  onAssign={() => setAssigningItem(item)}
                  onConfirm={() => setConfirmingItem(item)}
                  onStartQa={() => handleStartQaInspection(item)}
                  onConfigureAql={() => setAqlEditingItem(item)}
                  onReload={() => void fetchQueue()}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {acceptingItem && (
        <AcceptQaPlanModal
          item={acceptingItem}
          onClose={() => setAcceptingItem(null)}
          onAccepted={async () => {
            const currentItem = acceptingItem;
            setAcceptingItem(null);
            await fetchQueue();
            if (currentItem.hasAql && currentItem.qaRequired > 0) {
              setAssigningItem({ ...currentItem, status: "QA_IN_PROGRESS" });
            } else {
              setAqlEditingItem({ ...currentItem, status: "QA_IN_PROGRESS" });
            }
          }}
        />
      )}

      {inspectingJob && (
        <StartInspectionModal
          isOpen={inspectingJob !== null}
          workOrder={inspectingJob}
          onClose={() => setInspectingJob(null)}
          onStarted={() => void fetchQueue()}
        />
      )}

      {aqlEditingItem && (
        <ConfigureAqlModal
          item={aqlEditingItem}
          onClose={() => setAqlEditingItem(null)}
          onSaved={() => {
            setAqlEditingItem(null);
            void fetchQueue();
          }}
        />
      )}

      {assigningItem && data && (
        <AssignQaInspectorsModal
          item={assigningItem}
          inspectors={data.inspectors}
          onClose={() => setAssigningItem(null)}
          onSaved={() => {
            setAssigningItem(null);
            void fetchQueue();
          }}
        />
      )}

      {confirmingItem && (
        <ConfirmQaPlanModal
          item={confirmingItem}
          onClose={() => setConfirmingItem(null)}
          onConfirmed={() => {
            setConfirmingItem(null);
            void fetchQueue();
          }}
        />
      )}
    </div>
  );
}

function progressPct(person: QaAssigneeProgress) {
  const target = person.targetQty ?? null;
  return target ? Math.min(100, Math.round((person.doneQty / target) * 100)) : 0;
}

function MyQaShare({ person, complete }: { person: QaAssigneeProgress; complete: boolean }) {
  return (
    <div className="space-y-1.5 rounded-control border border-carbon-600 bg-carbon-900 p-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-ti-50">
          {person.name}
          {person.targetQty != null ? ` (${person.targetQty} ตัว)` : ""}
        </span>
        <span className={`font-mono font-semibold ${complete ? "text-emerald-300" : "text-ember-300"}`}>
          ตรวจแล้ว {person.doneQty}
          {person.targetQty != null ? ` / ${person.targetQty}` : ""} ตัว
        </span>
      </div>
      {person.targetQty != null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-carbon-700">
          <div
            className={`h-full ${complete ? "bg-emerald-400" : "bg-ember-500"}`}
            style={{ width: `${progressPct(person)}%` }}
          />
        </div>
      )}
      {complete && person.reworkPending === 0 && (
        <p className="font-medium text-emerald-400">ตรวจครบตามยอดของฉันแล้ว</p>
      )}
      {person.reworkPending > 0 && (
        <p className="font-semibold text-fail">
          มี {person.reworkPending} ตัวไม่ผ่าน รอแก้ไขและตรวจซ้ำเฉพาะข้อที่ไม่ผ่าน
        </p>
      )}
    </div>
  );
}

function QaPersonProgress({ person }: { person: QaAssigneeProgress }) {
  const target = person.targetQty ?? null;
  const complete = target != null && person.doneQty >= target;
  return (
    <li className="space-y-1 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-ti-100">
          {person.name}
          {target != null ? ` (${target} ตัว)` : ""}
        </span>
        <span className="flex items-center gap-1.5 font-mono">
          <span className={complete ? "text-emerald-300" : "text-ember-300"}>
            ตรวจแล้ว {person.doneQty}
            {target != null ? `/${target}` : ""} ตัว
          </span>
          {complete && person.reworkPending === 0 && (
            <span className="rounded bg-emerald-500/15 px-1.5 text-emerald-300">เสร็จ</span>
          )}
          {person.reworkPending > 0 && (
            <span className="rounded border border-fail/40 bg-fail/15 px-1.5 text-fail">
              รอแก้ {person.reworkPending}
            </span>
          )}
          {person.rejectedQty > 0 && (
            <span className="rounded border border-carbon-600 px-1.5 text-ti-400">
              Reject {person.rejectedQty}
            </span>
          )}
        </span>
      </div>
      {target != null && (
        <div className="h-1 overflow-hidden rounded-full bg-carbon-700">
          <div
            className={`h-full ${complete ? "bg-emerald-400" : "bg-ember-500"}`}
            style={{ width: `${progressPct(person)}%` }}
          />
        </div>
      )}
    </li>
  );
}

function FailedUnitsBox({
  failedUnits,
  isHead,
  onReload,
}: {
  failedUnits: QaFailedUnitItem[];
  isHead: boolean;
  onReload: () => void;
}) {
  const [sendingId, setSendingId] = useState<string | null>(null);

  async function handleReturnToQc(inspectionId: string) {
    setSendingId(inspectionId);
    try {
      const res = await fetch("/api/qa-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "return_to_qc", inspectionId }),
      });
      if (res.ok) {
        onReload();
      }
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div className="rounded-control border border-fail/40 bg-fail/10 p-2.5 space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-fail">
          เครื่องไม่ผ่าน รอแก้ไข/ตรวจซ้ำเฉพาะข้อ ({failedUnits.length} เครื่อง)
        </span>
      </div>
      <ul className="space-y-1.5">
        {failedUnits.map((u) => (
          <li
            key={u.inspectionId}
            className="rounded border border-carbon-700 bg-carbon-900/90 p-2 space-y-1"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono font-semibold text-ti-50">
                {u.serialPump} <span className="text-ti-400 font-normal">(รอบ {u.roundNo})</span>
              </span>
              <span className="rounded border border-fail/50 bg-fail/15 px-1.5 py-0.5 text-[10px] font-semibold text-fail">
                ไม่ผ่าน {u.failedItemCount} ข้อ
              </span>
            </div>
            {u.defectNames && (
              <p className="text-ti-300 line-clamp-1">อาการ: {u.defectNames}</p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-[11px] text-ti-400">ผู้ตรวจ: {u.inspectorName}</span>
              <div className="flex items-center gap-1.5">
                {u.action !== "REWORK" && isHead && (
                  <button
                    type="button"
                    disabled={sendingId === u.inspectionId}
                    onClick={() => void handleReturnToQc(u.inspectionId)}
                    className="rounded border border-ember-500/50 bg-ember-500/15 px-2 py-1 text-[11px] font-semibold text-ember-300 hover:bg-ember-500/25 cursor-pointer"
                  >
                    {sendingId === u.inspectionId ? "กำลังส่ง…" : "ส่งให้ QC แก้ไข"}
                  </button>
                )}
                <Link
                  href={`/inspections/${u.inspectionId}/rework`}
                  className="rounded bg-fail px-2.5 py-1 text-[11px] font-semibold text-carbon-900 hover:brightness-105"
                >
                  ตรวจซ้ำเฉพาะข้อที่ไม่ผ่าน
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QueueCard({
  item,
  me,
  isHead,
  accepting,
  onAccept,
  onAssign,
  onConfirm,
  onStartQa,
  onConfigureAql,
  onReload,
}: {
  item: QaQueueItem;
  me: string | null;
  isHead: boolean;
  accepting: boolean;
  onAccept: () => void;
  onAssign: () => void;
  onConfirm: () => void;
  onStartQa: () => void;
  onConfigureAql: () => void;
  onReload: () => void;
}) {
  const isWaitingAccept = item.status === "QA_PENDING" || item.status === "QC_COMPLETED";
  const isInProgress = item.status === "QA_IN_PROGRESS";
  const isCompleted = item.status === "COMPLETED";
  const woNo = item.qaWorkOrderNo ?? `${item.planNo}-QA`;

  const myAssignee = me
    ? item.assignees.find((person) => String(person.userId) === String(me))
    : null;
  const isMyTargetReached =
    myAssignee?.targetQty != null && myAssignee.doneQty >= myAssignee.targetQty;
  const myDrafts = myAssignee?.drafts ?? [];
  const isMyComplete =
    Boolean(isMyTargetReached) && (myAssignee?.reworkPending ?? 0) === 0 && myDrafts.length === 0;

  const isQuotaReached = item.hasAql && item.qaRequired > 0 && item.qaDoneTotal >= item.qaRequired;
  const isReadyToConfirm =
    isInProgress && isQuotaReached && item.qaReworkPending === 0 && item.failedUnits.length === 0;

  const myDoneCount = myAssignee ? myAssignee.doneQty : item.qaDoneTotal;
  const myTargetTotal = myAssignee?.targetQty ?? item.qaRequired;
  const nextUnit = Math.min(myDoneCount + 1, Math.max(1, myTargetTotal));

  return (
    <li
      className={`space-y-2.5 app-panel rounded-panel border bg-carbon-800 p-4 flex flex-col justify-between ${
        item.failedUnits.length > 0 || (!item.hasAql && !isCompleted)
          ? "border-fail/60"
          : isReadyToConfirm
            ? "border-cyan-500/60"
            : isWaitingAccept
              ? "border-amber-500/50"
              : "border-carbon-700"
      }`}
    >
      <div className="space-y-2.5">
        {/* Top Row: Work Order No + Status Badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/plans/${item.id}`}
              className="font-mono font-semibold text-ti-50 hover:text-ember-400 transition-colors"
            >
              {woNo}
            </Link>
            <span className="font-mono text-xs text-ti-400">แผน {item.planNo}</span>
          </div>

          {!item.hasAql && !isCompleted ? (
            <span className="whitespace-nowrap rounded-full border border-fail/60 bg-fail/15 px-2 py-0.5 text-xs font-semibold text-fail">
              ไม่มี AQL
            </span>
          ) : isCompleted ? (
            <span className="whitespace-nowrap rounded-full border border-emerald-500/60 bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">
              ยืนยันผลแล้ว
            </span>
          ) : isReadyToConfirm ? (
            <span className="whitespace-nowrap rounded-full border border-cyan-500/60 bg-cyan-500/15 px-2 py-0.5 text-xs font-semibold text-cyan-300">
              รอ Head QA ยืนยันผล
            </span>
          ) : isWaitingAccept ? (
            <span className="whitespace-nowrap rounded-full border border-amber-500/60 bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-300">
              รอรับงานจาก QC
            </span>
          ) : (
            <span className="whitespace-nowrap rounded-full border border-ember-500/60 px-2 py-0.5 text-xs text-ember-400">
              รับงานแล้ว · กำลังตรวจ
            </span>
          )}
        </div>

        {/* Model & Document Info */}
        <p className="text-sm text-ti-200">
          {item.brandName} {item.modelCode} ·{" "}
          {item.docType === "PO" ? `PO ${item.docNo} (ผลิตเอง)` : `Invoice ${item.docNo} (นำเข้า)`}
          <span className="block text-xs text-ti-400">
            {item.vendorName ?? "ยังไม่ระบุ Vendor"}
            {item.modelDescription ? ` · ${item.modelDescription}` : ""}
          </span>
        </p>

        {/* Lot (Invoice/PO lotQty) & AQL Rule */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ti-400">
          <span>
            ยอดตาม {item.docType === "PO" ? "PO" : "Invoice"} (ล็อต){" "}
            <strong className="font-mono text-ti-200">{item.lotQty.toLocaleString("th-TH")}</strong>{" "}
            เครื่อง · QC ตรวจผ่าน {item.qcDoneTotal}/{item.qcRequired || item.lotCalledTotal}
          </span>
          {item.hasAql && item.aqlLevelLabel && (
            <button
              type="button"
              onClick={onConfigureAql}
              className="rounded border border-carbon-600 bg-carbon-900 px-2 py-0.5 font-mono text-[11px] text-ti-300 hover:border-ember-500 hover:text-ti-50 cursor-pointer"
              title="เปลี่ยนระดับ AQL"
            >
              AQL {item.aqlLevelLabel} ({item.aqlCodeLetter})
            </button>
          )}
        </div>

        {/* Accepted By / Handover status line */}
        {item.qaAcceptedAt && !isWaitingAccept && (
          <p className="text-[11px] text-ti-400">
            รับงานโดย <span className="text-ti-200">{item.qaAcceptedByName ?? "Head QA"}</span>
            {item.assignees.length > 0
              ? ` · จ่ายงานผู้ตรวจ ${item.assignees.length} คน`
              : " · ยังไม่ได้ระบุผู้ตรวจ"}
          </p>
        )}

        {/* QA Quota & Progress Bar or Missing AQL Box */}
        {item.hasAql ? (
          <div className="space-y-1 pt-0.5">
            <div className="flex items-center justify-between text-sm font-mono text-ti-200">
              <span>
                ต้องตรวจ {item.qaRequired} · ตรวจแล้ว {item.qaDoneTotal}
              </span>
              {isHead && !isCompleted && !isWaitingAccept && (
                <button
                  type="button"
                  onClick={onAssign}
                  className="text-xs font-sans font-medium text-ember-400 hover:text-ember-300 underline underline-offset-2 cursor-pointer"
                >
                  {item.assignees.length > 0 ? "แก้ผู้ตรวจ" : "จ่ายงานผู้ตรวจ"}
                </button>
              )}
            </div>
            <QcBar done={item.qaDoneTotal} required={item.qaRequired} />
          </div>
        ) : (
          <div className="rounded-control border border-fail/40 bg-fail/10 p-2.5 text-xs space-y-1.5">
            <p className="font-semibold text-fail">โมเดลนี้ไม่มี AQL</p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onConfigureAql}
                className="font-semibold text-ember-400 hover:text-ember-300 underline underline-offset-2 cursor-pointer"
              >
                ตั้งค่า AQL ทันที
              </button>
              <Link
                href={`/master/models?q=${encodeURIComponent(item.modelCode)}`}
                className="text-ti-300 hover:text-ti-50 underline underline-offset-2"
              >
                ไปที่ข้อมูลหลักโมเดล
              </Link>
            </div>
          </div>
        )}

        {/* Failed Units / Targeted Rework Box */}
        {item.failedUnits.length > 0 && (
          <FailedUnitsBox failedUnits={item.failedUnits} isHead={isHead} onReload={onReload} />
        )}

        {/* Inspector Progress Section (same style as JobsView) */}
        {myAssignee && !isHead ? (
          <MyQaShare person={myAssignee} complete={isMyComplete} />
        ) : (
          item.assignees.length > 0 && (
            <ul
              className="space-y-1.5 pt-1 border-t border-carbon-700/60"
              aria-label="ความคืบหน้าผู้ตรวจ QA"
            >
              {item.assignees.map((person) => (
                <QaPersonProgress key={person.userId} person={person} />
              ))}
            </ul>
          )
        )}
      </div>

      {/* Bottom Action Area */}
      <div className="pt-2 space-y-2">
        {!item.hasAql ? (
          <button
            type="button"
            onClick={onConfigureAql}
            className="h-11 w-full rounded-control app-primary-action bg-ember-500 hover:bg-ember-400 font-semibold text-sm text-carbon-900 transition-colors cursor-pointer"
          >
            เพิ่ม AQL โมเดล {item.modelCode}
          </button>
        ) : isCompleted ? (
          <Link
            href={`/plans/${item.id}?tab=inspections`}
            className="flex h-11 w-full items-center justify-center rounded-control border border-emerald-500/30 bg-emerald-950/20 font-medium text-xs sm:text-sm text-emerald-300 hover:border-emerald-500/50 transition-colors"
          >
            ยืนยันผลตรวจแล้ว ({item.qaDoneTotal}/{item.qaRequired}) · ดูผลตรวจ
          </Link>
        ) : isWaitingAccept ? (
          isHead ? (
            <button
              type="button"
              onClick={onAccept}
              disabled={accepting}
              className="h-11 w-full rounded-control app-primary-action bg-ember-500 hover:bg-ember-400 font-semibold text-sm text-carbon-900 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {accepting ? "กำลังรับงาน…" : "รับงานและจ่ายงาน QA"}
            </button>
          ) : (
            <div className="rounded-control border border-amber-500/30 bg-amber-500/10 p-2.5 text-center text-xs text-amber-300">
              รอหัวหน้า QA กดรับงานและจ่ายงาน
            </div>
          )
        ) : isReadyToConfirm && isHead ? (
          <button
            type="button"
            onClick={onConfirm}
            className="h-11 w-full rounded-control app-primary-action bg-pass hover:brightness-105 font-semibold text-sm text-carbon-950 transition-colors cursor-pointer"
          >
            ยืนยันผลการตรวจ QA ({item.qaDoneTotal}/{item.qaRequired})
          </button>
        ) : myDrafts.length > 0 ? (
          <div className="space-y-1.5">
            {myDrafts.map((draft) => (
              <Link
                key={draft.inspectionId}
                href={`/inspections/${draft.inspectionId}`}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-control app-primary-action bg-ember-500 hover:bg-ember-400 font-semibold text-sm text-carbon-900 transition-colors"
              >
                <span>ตรวจต่อเครื่องที่ค้างอยู่ ({draft.serialPump})</span>
              </Link>
            ))}
          </div>
        ) : isHead && item.assignees.length === 0 ? (
          <button
            type="button"
            onClick={onAssign}
            className="h-11 w-full rounded-control app-primary-action bg-ember-500 hover:bg-ember-400 font-semibold text-sm text-carbon-900 transition-colors cursor-pointer"
          >
            จ่ายงานผู้ตรวจ QA ({item.qaRequired} เครื่อง)
          </button>
        ) : isMyComplete ? (
          <button
            type="button"
            disabled
            className="h-11 w-full rounded-control border border-emerald-500/30 bg-emerald-950/20 font-medium text-xs sm:text-sm text-emerald-300 cursor-not-allowed opacity-90"
          >
            คุณตรวจครบตามยอดที่ได้รับมอบหมายแล้ว
          </button>
        ) : isQuotaReached ? (
          <div className="rounded-control border border-cyan-500/30 bg-cyan-500/10 p-2.5 text-center text-xs text-cyan-300">
            {item.failedUnits.length > 0
              ? `ตรวจครบ ${item.qaDoneTotal}/${item.qaRequired} เครื่องแล้ว · รอแก้ไขเครื่องที่ไม่ผ่าน ${item.failedUnits.length} เครื่อง`
              : "ตรวจครบตามยอด AQL แล้ว · รอหัวหน้า QA กดยืนยันผล"}
          </div>
        ) : !myAssignee ? (
          <div className="rounded-control border border-carbon-700 bg-carbon-900/60 p-2.5 text-center text-xs text-ti-400">
            {item.assignees.length > 0
              ? `รอผู้ตรวจ QA ดำเนินการ (${item.assignees.map((p) => p.name).join(", ")})`
              : "รอหัวหน้า QA จ่ายงานให้ผู้ตรวจ QA"}
          </div>
        ) : (
          <button
            type="button"
            onClick={onStartQa}
            className="h-11 w-full rounded-control app-primary-action bg-ember-500 hover:bg-ember-400 font-semibold text-sm text-carbon-900 transition-colors cursor-pointer"
          >
            {myDoneCount > 0
              ? `ตรวจต่อ (เครื่องที่ ${nextUnit}/${myTargetTotal})`
              : "เริ่มตรวจเครื่องแรก"}
          </button>
        )}
      </div>
    </li>
  );
}

function AcceptQaPlanModal({
  item,
  onClose,
  onAccepted,
}: {
  item: QaQueueItem;
  onClose: () => void;
  onAccepted: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirmAccept() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/qa-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept", planId: item.id }),
      });
      const resJson = await res.json();
      if (!res.ok || resJson.status === "error") {
        throw new Error(resJson.message || "กดรับงานไม่สำเร็จ");
      }
      onAccepted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการรับงาน");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-md rounded-panel border border-ember-500/50 bg-carbon-800 p-5 space-y-4 shadow-2xl">
        <div className="flex items-start justify-between gap-2 border-b border-carbon-700 pb-3">
          <div>
            <h2 className="text-base font-semibold text-ti-50">
              รับงานและเตรียมสุ่มตรวจ QA (แผน {item.planNo})
            </h2>
            <p className="text-xs text-ti-400">
              {item.brandName ? `${item.brandName} ` : ""}{item.modelCode}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-control text-ti-400 hover:bg-carbon-700 hover:text-ti-50 cursor-pointer"
            aria-label="ปิด"
          >
            <WorkOrderIcon name="close" />
          </button>
        </div>

        <div className="rounded-control border border-carbon-700 bg-carbon-900/80 p-3.5 space-y-2 text-xs">
          <div className="flex justify-between text-ti-300">
            <span>ยอดตรวจของล็อต QC:</span>
            <span className="font-mono font-semibold text-ti-100">{item.lotQty.toLocaleString("th-TH")} เครื่อง</span>
          </div>
          <div className="flex justify-between text-ti-300">
            <span>เกณฑ์ระดับ AQL:</span>
            <span className="font-mono font-semibold text-ember-400">
              {item.aqlLevel ? `${item.aqlLevelLabel ?? item.aqlLevel} (${item.aqlCodeLetter ?? "-"})` : "ยังไม่ได้ตั้งค่า"}
            </span>
          </div>
          <div className="flex justify-between text-ti-300">
            <span>ยอดที่ต้องสุ่มตรวจ QA:</span>
            <span className="font-mono font-bold text-ember-400 text-sm">
              {item.qaRequired > 0 ? `${item.qaRequired} เครื่อง` : "รอตั้งค่า AQL"}
            </span>
          </div>
          <p className="border-t border-carbon-700/80 pt-2 text-ti-300 leading-relaxed">
            ยืนยันการรับงานจากฝ่าย QC เพื่อเปิดใบงานสุ่มตรวจ QA สำหรับแผนนี้ใช่หรือไม่? เมื่อยืนยันแล้ว ระบบจะเปิดหน้าต่างจ่ายงานผู้ตรวจ QA ให้ทันที
          </p>
        </div>

        {error && <p className="text-xs text-fail">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-carbon-700 pt-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-10 rounded-control border border-carbon-600 bg-carbon-800 px-4 text-xs font-medium text-ti-300 hover:bg-carbon-700 cursor-pointer"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleConfirmAccept}
            disabled={submitting}
            className="h-10 rounded-control app-primary-action bg-ember-500 hover:bg-ember-400 px-4 text-xs font-bold text-carbon-900 disabled:opacity-50 cursor-pointer shadow-sm"
          >
            {submitting ? "กำลังรับงาน…" : "ยืนยันรับงานและจ่ายงาน QA"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AssignQaInspectorsModal({
  item,
  inspectors,
  onClose,
  onSaved,
}: {
  item: QaQueueItem;
  inspectors: Inspector[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    item.assignees.length > 0 ? item.assignees.map((a) => a.userId) : [],
  );
  const [targets, setTargets] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const a of item.assignees) {
      if (a.targetQty != null) map[a.userId] = String(a.targetQty);
    }
    return map;
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const totalNeed = item.qaRequired;

  const currentSum = useMemo(() => {
    return selectedIds.reduce((sum, uid) => {
      const n = Number((targets[uid] ?? "").trim());
      return sum + (Number.isFinite(n) && n > 0 ? n : 0);
    }, 0);
  }, [selectedIds, targets]);

  function toggleInspector(userId: string) {
    setSelectedIds((prev) => {
      const exists = prev.includes(userId);
      const next = exists ? prev.filter((id) => id !== userId) : [...prev, userId].slice(0, 5);
      if (next.length > 0 && totalNeed > 0) {
        const split = splitAssigneeTargets(totalNeed, next.length);
        const nextTargets: Record<string, string> = {};
        next.forEach((id, idx) => {
          nextTargets[id] = String(split[idx] ?? 1);
        });
        setTargets(nextTargets);
      }
      return next;
    });
  }

  function handleSplitEvenly() {
    if (selectedIds.length === 0 || totalNeed <= 0) return;
    const split = splitAssigneeTargets(totalNeed, selectedIds.length);
    const nextTargets: Record<string, string> = {};
    selectedIds.forEach((id, idx) => {
      nextTargets[id] = String(split[idx] ?? 1);
    });
    setTargets(nextTargets);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (selectedIds.length === 0) {
      setErr("กรุณาเลือกผู้ตรวจ QA อย่างน้อย 1 คน");
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const assigneesPayload = selectedIds.map((uid) => ({
        userId: uid,
        targetQty: targets[uid] ? Number(targets[uid]) : null,
      }));
      const res = await fetch("/api/qa-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assign",
          planId: item.id,
          assigneesJson: JSON.stringify(assigneesPayload),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status === "error") {
        throw new Error(json.message || "บันทึกการจ่ายงานไม่สำเร็จ");
      }
      onSaved();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "เกิดข้อผิดพลาด");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-qa-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-lg rounded-panel border border-carbon-600 bg-carbon-800 p-5 text-ti-50 shadow-xl space-y-4 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 border-b border-carbon-700 pb-3">
          <div>
            <h2 id="assign-qa-title" className="text-base sm:text-lg font-semibold text-ti-50">
              จ่ายงานสุ่มตรวจ QA — {item.qaWorkOrderNo ?? `${item.planNo}-QA`}
            </h2>
            <p className="text-xs text-ti-400 mt-0.5">
              {item.brandName} {item.modelCode} · ยอดล็อต {item.lotQty.toLocaleString("th-TH")}{" "}
              เครื่อง · ต้องสุ่มตรวจตาม AQL{" "}
              <strong className="font-mono text-ember-400">{totalNeed}</strong> เครื่อง
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-control p-1.5 text-ti-400 hover:bg-carbon-700 hover:text-ti-50 cursor-pointer"
            aria-label="ปิด"
          >
            <WorkOrderIcon name="close" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-carbon-700 bg-carbon-900/60 p-2.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-ti-300">เลือกผู้ตรวจ ({selectedIds.length} คน)</span>
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={handleSplitEvenly}
                  className="rounded border border-carbon-600 bg-carbon-800 px-2 py-1 text-ti-200 hover:border-ember-500 hover:text-ember-400 cursor-pointer"
                >
                  แบ่งเท่ากัน
                </button>
              )}
            </div>
            <div>
              <span className="text-ti-400">รวมที่จ่าย: </span>
              <span
                className={`font-mono font-semibold ${
                  currentSum === totalNeed
                    ? "text-pass"
                    : currentSum > totalNeed
                      ? "text-fail"
                      : "text-ember-400"
                }`}
              >
                {currentSum} / {totalNeed} เครื่อง
              </span>
            </div>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {inspectors.length === 0 ? (
              <p className="rounded-control border border-dashed border-carbon-600 p-4 text-center text-xs text-ti-400">
                ไม่พบรายชื่อผู้ตรวจที่มีบทบาท QA Inspector
              </p>
            ) : (
              inspectors.map((person) => {
                const slotIdx = selectedIds.indexOf(person.id);
                const selected = slotIdx !== -1;
                return (
                  <div
                    key={person.id}
                    className={`flex items-center justify-between gap-3 rounded-control border p-2.5 text-xs transition ${
                      selected
                        ? "border-ember-500 bg-ember-500/10"
                        : "border-carbon-700 bg-carbon-900/50 hover:border-carbon-600"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleInspector(person.id)}
                      className="flex flex-1 items-center gap-2.5 text-left cursor-pointer min-w-0"
                    >
                      <span
                        className={`flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold ${
                          selected
                            ? "bg-ember-500 text-carbon-900"
                            : "border border-carbon-600 bg-carbon-800 text-ti-400"
                        }`}
                      >
                        {selected ? slotIdx + 1 : "+"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm text-ti-50 truncate">{person.name}</p>
                        <p className="text-[11px] text-ti-400 font-mono">
                          {person.code} · ค้าง {person.openWorkOrders} ใบ ({person.openUnits ?? 0}{" "}
                          เครื่อง)
                        </p>
                      </div>
                    </button>

                    {selected && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-ti-400">จ่าย:</span>
                        <input
                          type="number"
                          min={1}
                          max={totalNeed}
                          value={targets[person.id] ?? ""}
                          onChange={(e) =>
                            setTargets((prev) => ({ ...prev, [person.id]: e.target.value }))
                          }
                          aria-label={`จำนวนเครื่องของ ${person.name}`}
                          className="h-8 w-16 rounded-control border border-carbon-600 bg-carbon-900 px-2 text-right font-mono text-sm text-ti-50 focus:border-ember-500"
                        />
                        <span className="text-ti-400">ตัว</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {err && (
            <p
              role="alert"
              className="rounded-control border border-fail/40 bg-fail/10 p-2.5 text-xs text-fail"
            >
              {err}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-carbon-700 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="h-10 rounded-control border border-carbon-600 px-4 text-xs font-medium text-ti-200 hover:border-ti-400 cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting || selectedIds.length === 0}
              className="h-10 rounded-control bg-ember-500 hover:bg-ember-400 px-5 text-xs font-semibold text-carbon-950 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? "กำลังบันทึก…" : "บันทึกและจ่ายงาน"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmQaPlanModal({
  item,
  onClose,
  onConfirmed,
}: {
  item: QaQueueItem;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/qa-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          planId: item.id,
          remarks: remarks.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status === "error") {
        throw new Error(json.message || "ยืนยันผลการตรวจไม่สำเร็จ");
      }
      onConfirmed();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "เกิดข้อผิดพลาด");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-qa-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-md rounded-panel border border-carbon-600 bg-carbon-800 p-5 text-ti-50 shadow-xl space-y-4">
        <div className="flex items-start justify-between gap-3 border-b border-carbon-700 pb-3">
          <div>
            <h2 id="confirm-qa-title" className="text-base sm:text-lg font-semibold text-ti-50">
              ยืนยันผลการสุ่มตรวจ QA — {item.planNo}
            </h2>
            <p className="text-xs text-ti-400 mt-0.5">
              {item.brandName} {item.modelCode} ·{" "}
              {item.docType === "PO" ? `PO ${item.docNo} (ผลิตเอง)` : `Invoice ${item.docNo} (นำเข้า)`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-control p-1.5 text-ti-400 hover:bg-carbon-700 hover:text-ti-50 cursor-pointer"
            aria-label="ปิด"
          >
            <WorkOrderIcon name="close" />
          </button>
        </div>

        <form onSubmit={handleConfirm} className="space-y-4">
          <div className="rounded-control border border-carbon-700 bg-carbon-900/70 p-3.5 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-ti-400">ยอดตามล็อต ({item.docType}):</span>
              <span className="font-mono font-semibold text-ti-50">
                {item.lotQty.toLocaleString("th-TH")} เครื่อง
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-ti-400">เกณฑ์สุ่มตรวจ AQL:</span>
              <span className="font-mono text-ti-200">
                {item.aqlLevelLabel} (Code {item.aqlCodeLetter} · Ac {item.aqlAc ?? 0} / Re{" "}
                {item.aqlRe ?? 1})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-ti-400">จำนวนที่ QA สุ่มตรวจแล้ว:</span>
              <span className="font-mono font-semibold text-pass">
                {item.qaDoneTotal} / {item.qaRequired} เครื่อง
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-ti-400">ผ่านเกณฑ์:</span>
              <span className="font-mono text-pass">{item.qaPassedTotal} เครื่อง</span>
            </div>
          </div>

          <label className="block space-y-1 text-xs text-ti-300">
            <span>หมายเหตุการอนุมัติ (ไม่บังคับ)</span>
            <textarea
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="ระบุหมายเหตุเพิ่มเติม (ถ้ามี)"
              className="w-full rounded-control border border-carbon-600 bg-carbon-900 px-3 py-2 text-xs text-ti-50 focus:border-ember-500"
            />
          </label>

          {err && (
            <p
              role="alert"
              className="rounded-control border border-fail/40 bg-fail/10 p-2.5 text-xs text-fail"
            >
              {err}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-carbon-700 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="h-10 rounded-control border border-carbon-600 px-4 text-xs font-medium text-ti-200 hover:border-ti-400 cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-10 rounded-control bg-pass hover:brightness-105 px-5 text-xs font-semibold text-carbon-950 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? "กำลังยืนยัน…" : "ยืนยันเรียบร้อยและปิดแผน"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfigureAqlModal({
  item,
  onClose,
  onSaved,
}: {
  item: QaQueueItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selectedLevel, setSelectedLevel] = useState<AqlLevel>(item.aqlLevel ?? "REDUCED");
  const [saveAsModelDefault, setSaveAsModelDefault] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const preview = useMemo(
    () => calculateAqlSample(selectedLevel, item.lotQty),
    [selectedLevel, item.lotQty],
  );

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/qa-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_aql",
          planId: item.id,
          aqlLevel: selectedLevel,
          saveAsModelDefault,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status === "error") {
        throw new Error(json.message || "บันทึกค่า AQL ไม่สำเร็จ");
      }
      onSaved();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "เกิดข้อผิดพลาด");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="aql-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-lg rounded-panel border border-carbon-600 bg-carbon-800 p-5 text-ti-50 shadow-xl space-y-4">
        <div className="flex items-start justify-between gap-3 border-b border-carbon-700 pb-3">
          <div>
            <h2 id="aql-modal-title" className="text-base sm:text-lg font-semibold text-ti-50">
              {item.hasAql
                ? `เปลี่ยนระดับ AQL — ${item.modelCode}`
                : `ตั้งค่า AQL โมเดล ${item.modelCode}`}
            </h2>
            <p className="text-xs text-ti-400 mt-0.5">
              แผน <span className="font-mono text-ti-200">{item.planNo}</span> · ยอดตาม{" "}
              {item.docType === "PO" ? "PO" : "Invoice"} (ล็อต){" "}
              <strong className="text-ti-100">{item.lotQty.toLocaleString("th-TH")}</strong> เครื่อง
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-control p-1.5 text-ti-400 hover:bg-carbon-700 hover:text-ti-50 cursor-pointer"
            aria-label="ปิด"
          >
            <WorkOrderIcon name="close" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <label className="block text-xs font-medium text-ti-200">เลือกระดับ AQL</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(["REDUCED", "NORMAL", "TIGHTENED"] as const).map((lvl) => {
                const sample = calculateAqlSample(lvl, item.lotQty);
                const active = selectedLevel === lvl;
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setSelectedLevel(lvl)}
                    className={`rounded-control border p-3 text-left transition cursor-pointer ${
                      active
                        ? "border-ember-500 bg-ember-500/15"
                        : "border-carbon-700 bg-carbon-900/60 hover:border-carbon-500"
                    }`}
                  >
                    <p className="text-xs font-semibold text-ti-50">{AQL_LEVEL_SHORT_LABELS[lvl]}</p>
                    <p className="text-[10px] text-ti-400 font-mono">{lvl}</p>
                    {sample && (
                      <p className="mt-2 font-mono text-sm font-bold text-ember-400">
                        สุ่ม {sample.qaRequired} เครื่อง
                        <span className="block text-[10px] font-normal text-ti-400">
                          Code {sample.codeLetter}
                        </span>
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {preview && (
            <div className="rounded-control border border-carbon-700 bg-carbon-900/70 p-3 text-xs space-y-1">
              <p className="text-ti-300">เกณฑ์ {AQL_LEVEL_LABELS[selectedLevel]}</p>
              <p className="text-sm font-semibold text-ti-50">
                ล็อต {item.lotQty.toLocaleString("th-TH")} เครื่อง · Code{" "}
                <span className="font-mono text-ember-400">{preview.codeLetter}</span> · ต้องตรวจ{" "}
                <span className="font-mono text-pass">{preview.qaRequired}</span> เครื่อง
              </p>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-ti-200 cursor-pointer">
            <input
              type="checkbox"
              checked={saveAsModelDefault}
              onChange={(e) => setSaveAsModelDefault(e.target.checked)}
              className="size-4 rounded border-carbon-600 bg-carbon-900 text-ember-500"
            />
            <span>
              บันทึกเป็นค่าตั้งต้นของโมเดล <strong>{item.modelCode}</strong>
            </span>
          </label>

          <div className="flex items-center justify-between pt-1 text-xs">
            <Link
              href={`/master/models?q=${encodeURIComponent(item.modelCode)}`}
              className="text-ember-400 underline underline-offset-2 hover:text-ember-300"
            >
              ไปที่ข้อมูลหลักโมเดล ({item.modelCode})
            </Link>
          </div>

          {err && (
            <p
              role="alert"
              className="rounded-control border border-fail/40 bg-fail/10 p-2.5 text-xs text-fail"
            >
              {err}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-carbon-700 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="h-10 rounded-control border border-carbon-600 px-4 text-xs font-medium text-ti-200 hover:border-ti-400 cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-10 rounded-control bg-ember-500 hover:bg-ember-400 px-5 text-xs font-semibold text-carbon-950 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
