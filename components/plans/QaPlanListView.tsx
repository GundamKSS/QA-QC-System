"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppBack } from "@/components/ui/AppBack";
import { CardsSkeleton } from "@/components/feedback/CardsSkeleton";
import { LoadError } from "@/components/feedback/LoadError";
import { WorkOrderIcon } from "@/components/plans/WorkOrderIcon";
import { splitAssigneeTargets } from "@/lib/plans/rules";
import type { Inspector } from "@/lib/plans/store";
import {
  AQL_LEVEL_LABELS,
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
  | "pending"
  | "in_progress"
  | "rework"
  | "ready_confirm"
  | "missing_aql"
  | "completed";

/**
 * แดชบอร์ดจัดการแผนงานสุ่มตรวจ QA สำหรับ Head QA (/plans):
 * 1. รับงานต่อจาก QC ที่ตรวจเสร็จแล้ว (QA_PENDING)
 * 2. กำหนดระดับ AQL และสุ่มตรวจตามยอดล็อต Invoice/PO
 * 3. แจกจ่ายงานให้ QA Inspector (1-5 คน เฉพาะบทบาท QA_INSPECTOR)
 * 4. ติดตามความคืบหน้าของทีม และส่งเครื่องไม่ผ่านกลับไปให้ QC แก้ไข
 * 5. กดยืนยันผลการตรวจ QA (Confirm QA) เมื่อตรวจครบตามเกณฑ์ AQL
 */
export function QaPlanListView() {
  const [data, setData] = useState<QaQueuePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  const [aqlEditingItem, setAqlEditingItem] = useState<QaQueueItem | null>(null);
  const [assigningItem, setAssigningItem] = useState<QaQueueItem | null>(null);
  const [confirmingItem, setConfirmingItem] = useState<QaQueueItem | null>(null);
  const [acceptingItem, setAcceptingItem] = useState<QaQueueItem | null>(null);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/qa-queue");
      if (!res.ok) {
        throw new Error(`โหลดข้อมูลแผนตรวจ QA ไม่สำเร็จ (รหัส ${res.status})`);
      }
      const json = await res.json();
      setData(json.data ?? json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/qa-queue");
        if (!res.ok) throw new Error(`โหลดข้อมูลแผนตรวจ QA ไม่สำเร็จ (รหัส ${res.status})`);
        const json = await res.json();
        if (!ignore) setData(json.data ?? json);
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  const queue = useMemo(() => data?.queue ?? [], [data?.queue]);

  const filteredPlans = useMemo(() => {
    if (activeFilter === "all") return queue;
    if (activeFilter === "pending") {
      return queue.filter((item) => item.status === "QA_PENDING");
    }
    if (activeFilter === "in_progress") {
      return queue.filter((item) => item.status === "QA_IN_PROGRESS");
    }
    if (activeFilter === "rework") {
      return queue.filter((item) => item.failedUnits.length > 0);
    }
    if (activeFilter === "ready_confirm") {
      return queue.filter(
        (item) =>
          item.status === "QA_IN_PROGRESS" &&
          item.hasAql &&
          item.qaRequired > 0 &&
          item.qaDoneTotal >= item.qaRequired &&
          item.qaReworkPending === 0,
      );
    }
    if (activeFilter === "missing_aql") {
      return queue.filter((item) => !item.hasAql && item.status !== "COMPLETED");
    }
    if (activeFilter === "completed") {
      return queue.filter((item) => item.status === "COMPLETED");
    }
    return queue;
  }, [queue, activeFilter]);

  const statCounts = useMemo(() => {
    const pendingCnt = queue.filter(
      (item) => item.status === "QA_PENDING",
    ).length;
    const inProgressCnt = queue.filter((item) => item.status === "QA_IN_PROGRESS").length;
    const readyCnt = queue.filter(
      (item) =>
        item.status === "QA_IN_PROGRESS" &&
        item.hasAql &&
        item.qaRequired > 0 &&
        item.qaDoneTotal >= item.qaRequired &&
        item.qaReworkPending === 0,
    ).length;
    const reworkCnt = queue.reduce((sum, item) => sum + item.failedUnits.length, 0);
    const completedCnt = queue.filter((item) => item.status === "COMPLETED").length;
    const missingAqlCnt = queue.filter((item) => !item.hasAql && item.status !== "COMPLETED").length;
    return { pendingCnt, inProgressCnt, readyCnt, reworkCnt, completedCnt, missingAqlCnt };
  }, [queue]);

  const chips: { key: FilterKey; label: string; count: number; badgeClass?: string }[] = [
    { key: "all", label: "ทั้งหมด", count: queue.length },
    {
      key: "pending",
      label: "รอรับงานจาก QC",
      count: statCounts.pendingCnt,
      badgeClass: statCounts.pendingCnt > 0 ? "text-amber-300 bg-amber-500/20 border border-amber-500/40 font-semibold" : undefined,
    },
    {
      key: "in_progress",
      label: "กำลังสุ่มตรวจ",
      count: statCounts.inProgressCnt,
      badgeClass: statCounts.inProgressCnt > 0 ? "text-ember-300 bg-ember-500/15 border border-ember-500/30" : undefined,
    },
    {
      key: "rework",
      label: "งานที่ต้อง rework",
      count: statCounts.reworkCnt,
      badgeClass: statCounts.reworkCnt > 0 ? "text-ti-50 bg-fail/30 border border-fail/60 font-semibold" : undefined,
    },
    {
      key: "ready_confirm",
      label: "รอยืนยันผล",
      count: statCounts.readyCnt,
      badgeClass: statCounts.readyCnt > 0 ? "text-cyan-800 bg-cyan-500/20 border border-cyan-500/40 font-semibold dark:text-cyan-300" : undefined,
    },
    {
      key: "completed",
      label: "เสร็จแล้ว",
      count: statCounts.completedCnt,
      badgeClass: "text-ti-400 bg-carbon-800 border border-carbon-700",
    },
  ];

  return (
    <div className="min-w-0 w-full space-y-5 p-4 sm:p-6">
      <AppBack href="/home">กลับหน้าหลัก</AppBack>
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-ti-50">แผนงานสุ่มตรวจ QA</h1>
          <p className="text-sm text-ti-400">
            รับงานต่อจาก QC · มอบหมายผู้ตรวจตามเกณฑ์ AQL · ติดตามความคืบหน้าและยืนยันผล
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/master/aql-table"
            className="inline-flex h-9 items-center rounded-control border border-carbon-600 bg-carbon-800 px-3 text-xs font-medium text-ti-200 hover:border-carbon-500 hover:text-ti-50 transition-colors"
          >
            ตาราง AQL
          </Link>
          <button
            type="button"
            onClick={() => void fetchPlans()}
            disabled={loading}
            className="inline-flex h-9 items-center rounded-control border border-carbon-600 bg-carbon-800 px-3 text-xs font-medium text-ti-200 hover:border-carbon-500 hover:text-ti-50 disabled:opacity-50 cursor-pointer transition-colors"
          >
            {loading ? "กำลังโหลด…" : "รีเฟรช"}
          </button>
        </div>
      </header>

      {/* 4 Summary Stat Cards */}
      <section aria-label="สรุปแผนงาน QA" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-panel border border-amber-500/40 bg-carbon-800/90 p-3.5 space-y-1">
          <p className="text-xs text-amber-400 font-medium">รอรับงานจาก QC</p>
          <p className="font-mono text-2xl font-bold text-ti-50">{statCounts.pendingCnt}</p>
          <p className="text-[11px] text-ti-400">QC ตรวจเสร็จแล้ว ส่งต่อให้ QA</p>
        </div>
        <div className="rounded-panel border border-ember-500/40 bg-carbon-800/90 p-3.5 space-y-1">
          <p className="text-xs text-ember-400 font-medium">กำลังสุ่มตรวจ</p>
          <p className="font-mono text-2xl font-bold text-ti-50">{statCounts.inProgressCnt}</p>
          <p className="text-[11px] text-ti-400">จ่ายงานผู้ตรวจ QA แล้ว</p>
        </div>
        <div className="rounded-panel border border-cyan-500/40 bg-carbon-800/90 p-3.5 space-y-1">
          <p className="text-xs text-cyan-800 dark:text-cyan-400 font-medium">รอยืนยันผลปิดแผน</p>
          <p className="font-mono text-2xl font-bold text-ti-50">{statCounts.readyCnt}</p>
          <p className="text-[11px] text-ti-400">สุ่มตรวจครบตาม AQL แล้ว</p>
        </div>
        <div className="rounded-panel border border-fail/40 bg-carbon-800/90 p-3.5 space-y-1">
          <p className="text-xs text-fail font-medium">เครื่องรอ Rework</p>
          <p className="font-mono text-2xl font-bold text-fail">{statCounts.reworkCnt}</p>
          <p className="text-[11px] text-ti-400">ส่งกลับให้ QC แก้ไขเฉพาะข้อ</p>
        </div>
      </section>

      {error && <LoadError message={error} onRetry={() => void fetchPlans()} />}

      {!data ? (
        !error && <CardsSkeleton label="กำลังโหลดแผนงาน QA" />
      ) : (
        <div aria-busy={loading} className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
          {/* Filter Chips Bar */}
          <nav aria-label="กรองสถานะแผน" className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
            {chips.map((chip) => {
              const active = activeFilter === chip.key;
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setActiveFilter(chip.key)}
                  className={`shrink-0 inline-flex items-center gap-1.5 sm:gap-2 h-8 sm:h-9 px-3 sm:px-3.5 rounded-full text-xs font-medium transition-all border cursor-pointer ${
                    active
                      ? "border-ember-500 bg-carbon-700 text-ti-50 shadow-sm"
                      : "border-carbon-700 bg-carbon-800/80 text-ti-300 hover:border-carbon-600 hover:text-ti-100"
                  }`}
                >
                  <span className="whitespace-nowrap">{chip.label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[11px] font-mono font-semibold ${
                      chip.badgeClass || (active ? "bg-ember-500/20 text-ember-300" : "bg-carbon-900 text-ti-400")
                    }`}
                  >
                    {chip.count}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Plan Cards List */}
          {filteredPlans.length === 0 ? (
            <div className="rounded-panel border border-dashed border-carbon-700 bg-carbon-900/40 p-8 text-center text-sm text-ti-400">
              ไม่มีแผนงานในหมวดนี้
            </div>
          ) : (
            <ul className="space-y-3" aria-label="รายการแผนงาน QA">
              {filteredPlans.map((item) => (
                <QaPlanManagementCard
                  key={item.id}
                  item={item}
                  accepting={acceptingItem?.id === item.id}
                  onAccept={() => setAcceptingItem(item)}
                  onAssign={() => setAssigningItem(item)}
                  onConfirm={() => setConfirmingItem(item)}
                  onConfigureAql={() => setAqlEditingItem(item)}
                  onReload={() => void fetchPlans()}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Modals for Head QA Management */}
      {acceptingItem && (
        <AcceptQaPlanModal
          item={acceptingItem}
          onClose={() => setAcceptingItem(null)}
          onAccepted={async () => {
            const currentItem = acceptingItem;
            setAcceptingItem(null);
            await fetchPlans();
            if (currentItem.hasAql && currentItem.qaRequired > 0) {
              setAssigningItem({ ...currentItem, status: "QA_IN_PROGRESS" });
            } else {
              setAqlEditingItem({ ...currentItem, status: "QA_IN_PROGRESS" });
            }
          }}
        />
      )}

      {assigningItem && (
        <AssignQaInspectorsModal
          item={assigningItem}
          inspectors={data?.inspectors ?? []}
          onClose={() => setAssigningItem(null)}
          onSaved={() => {
            setAssigningItem(null);
            void fetchPlans();
          }}
        />
      )}

      {confirmingItem && (
        <ConfirmQaPlanModal
          item={confirmingItem}
          onClose={() => setConfirmingItem(null)}
          onConfirmed={() => {
            setConfirmingItem(null);
            void fetchPlans();
          }}
        />
      )}

      {aqlEditingItem && (
        <ConfigureAqlModal
          item={aqlEditingItem}
          onClose={() => setAqlEditingItem(null)}
          onSaved={() => {
            setAqlEditingItem(null);
            void fetchPlans();
          }}
        />
      )}
    </div>
  );
}

/** Card แสดงแผนงานในมุมมอง Head QA: เน้นการรับงาน, ตรวจสอบ AQL, การจ่ายงานผู้ตรวจ, และยืนยันผล */
function QaPlanManagementCard({
  item,
  accepting,
  onAccept,
  onAssign,
  onConfirm,
  onConfigureAql,
  onReload,
}: {
  item: QaQueueItem;
  accepting: boolean;
  onAccept: () => void;
  onAssign: () => void;
  onConfirm: () => void;
  onConfigureAql: () => void;
  onReload: () => void;
}) {
  const isWaitingAccept = item.status === "QA_PENDING";
  const isInProgress = item.status === "QA_IN_PROGRESS";
  const isCompleted = item.status === "COMPLETED";
  const woNo = item.qaWorkOrderNo ?? `${item.planNo}-QA`;

  const isQuotaReached = item.hasAql && item.qaRequired > 0 && item.qaDoneTotal >= item.qaRequired;
  const isReadyToConfirm =
    isInProgress && isQuotaReached && item.qaReworkPending === 0 && item.failedUnits.length === 0;

  return (
    <li
      className={`space-y-3 app-panel rounded-panel border bg-carbon-800 p-4 sm:p-5 transition-all ${
        item.failedUnits.length > 0 || (!item.hasAql && !isCompleted)
          ? "border-fail/60"
          : isReadyToConfirm
            ? "border-cyan-500/60"
            : isWaitingAccept
              ? "border-amber-500/50"
              : "border-carbon-700"
      }`}
    >
      {/* Top Header: Plan No, Doc No, Status */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/plans/${item.id}`}
              className="font-mono text-base font-bold text-ti-50 hover:text-ember-400 transition-colors"
            >
              แผน {item.planNo}
            </Link>
            <span className="font-mono text-xs text-ti-400">ใบงาน {woNo}</span>
            <span className="rounded bg-carbon-700 px-2 py-0.5 text-[11px] font-medium text-ti-300">
              {item.docType === "PO" ? `PO ${item.docNo} (ผลิตเอง)` : `Invoice ${item.docNo} (นำเข้า)`}
            </span>
          </div>
          <p className="mt-1 text-sm text-ti-200">
            {item.brandName} {item.modelCode}
            {item.modelDescription ? ` · ${item.modelDescription}` : ""}
            <span className="text-xs text-ti-400 block sm:inline sm:ml-1">
              ({item.vendorName ?? "ยังไม่ระบุ Vendor"})
            </span>
          </p>
        </div>

        {/* Status Badge */}
        {!item.hasAql && !isCompleted ? (
          <span className="rounded-full border border-fail/60 bg-fail/15 px-2.5 py-0.5 text-xs font-semibold text-fail">
            ไม่มีเกณฑ์ AQL
          </span>
        ) : isCompleted ? (
          <span className="rounded-full border border-emerald-500/60 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
            ยืนยันผลแล้ว
          </span>
        ) : isReadyToConfirm ? (
          <span className="rounded-full border border-cyan-500/60 bg-cyan-500/15 px-2.5 py-0.5 text-xs font-semibold text-cyan-800 dark:text-cyan-300">
            รอ Head QA ยืนยันผล
          </span>
        ) : isWaitingAccept ? (
          <span className="rounded-full border border-amber-500/60 bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
            รอรับงานจาก QC
          </span>
        ) : (
          <span className="rounded-full border border-ember-500/60 px-2.5 py-0.5 text-xs text-ember-400">
            รับงานแล้ว · กำลังตรวจ
          </span>
        )}
      </div>

      {/* Lot & AQL Quota Bar */}
      <div className="rounded-control border border-carbon-700/80 bg-carbon-900/60 p-3 space-y-2 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            ยอดตาม {item.docType} (ล็อต):{" "}
            <strong className="font-mono text-ti-50">{item.lotQty.toLocaleString("th-TH")}</strong> เครื่อง
            {" · "}QC ตรวจผ่าน {item.qcDoneTotal}/{item.qcRequired || item.lotCalledTotal}
          </span>
          {item.hasAql && item.aqlLevelLabel && (
            <button
              type="button"
              onClick={onConfigureAql}
              className="rounded border border-carbon-600 bg-carbon-800 px-2 py-0.5 font-mono text-[11px] text-ti-300 hover:border-ember-500 hover:text-ti-50 cursor-pointer"
            >
              AQL {item.aqlLevelLabel} ({item.aqlCodeLetter}) · ต้องสุ่มตรวจ {item.qaRequired} เครื่อง
            </button>
          )}
        </div>

        {item.hasAql && item.qaRequired > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-ti-400">
              <span>ความคืบหน้าสุ่มตรวจตาม AQL</span>
              <span className="font-mono text-ti-200">
                {item.qaDoneTotal}/{item.qaRequired} เครื่อง ({Math.min(100, Math.round((item.qaDoneTotal / item.qaRequired) * 100))}%)
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-carbon-700">
              <div
                className={`h-full ${item.qaDoneTotal >= item.qaRequired ? "bg-emerald-400" : "bg-ember-500"}`}
                style={{ width: `${Math.min(100, (item.qaDoneTotal / Math.max(1, item.qaRequired)) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Failed Units (Targeted Rework) */}
      {item.failedUnits.length > 0 && (
        <HeadFailedUnitsBox failedUnits={item.failedUnits} onReload={onReload} />
      )}

      {/* Team Progress: Assigned QA Inspectors */}
      {item.assignees.length > 0 && (
        <div className="space-y-1.5 rounded-control border border-carbon-700/60 bg-carbon-900/40 p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium text-ti-300">
              ผู้ตรวจ QA ที่ได้รับมอบหมาย ({item.assignees.length} คน)
            </span>
            {isInProgress && (
              <button
                type="button"
                onClick={onAssign}
                className="text-[11px] font-medium text-ember-400 hover:text-ember-300 underline underline-offset-2 cursor-pointer"
              >
                ปรับเปลี่ยนผู้ตรวจ
              </button>
            )}
          </div>
          <ul className="space-y-1.5 pt-1">
            {item.assignees.map((person) => (
              <QaInspectorProgressRow key={person.userId} person={person} />
            ))}
          </ul>
        </div>
      )}

      {/* Action Area */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-carbon-700/60">
        <div className="flex items-center gap-2">
          <Link
            href={`/plans/${item.id}`}
            className="text-xs text-ti-400 hover:text-ember-400 transition-colors"
          >
            ดูรายละเอียดแผน →
          </Link>
          <span className="text-carbon-600">·</span>
          <Link
            href={`/plans/${item.id}/report`}
            className="text-xs text-ti-400 hover:text-ember-400 transition-colors"
          >
            ดูรายงาน (Report)
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {!item.hasAql ? (
            <button
              type="button"
              onClick={onConfigureAql}
              className="h-9 rounded-control bg-ember-500 hover:bg-ember-400 px-3 text-xs font-semibold text-carbon-900 transition-colors cursor-pointer"
            >
              ตั้งค่า AQL
            </button>
          ) : isWaitingAccept ? (
            <button
              type="button"
              onClick={onAccept}
              disabled={accepting}
              className="h-9 rounded-control app-primary-action bg-ember-500 hover:bg-ember-400 px-4 text-xs font-semibold text-carbon-900 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
            >
              รับงานและจ่ายงาน QA
            </button>
          ) : isReadyToConfirm ? (
            <button
              type="button"
              onClick={onConfirm}
              className="h-9 rounded-control bg-pass hover:brightness-105 px-4 text-xs font-semibold text-carbon-950 transition-colors cursor-pointer shadow-sm"
            >
              ยืนยันผลการตรวจ QA ({item.qaDoneTotal}/{item.qaRequired})
            </button>
          ) : item.assignees.length === 0 ? (
            <button
              type="button"
              onClick={onAssign}
              className="h-9 rounded-control app-primary-action bg-ember-500 hover:bg-ember-400 px-3 text-xs font-semibold text-carbon-900 transition-colors cursor-pointer shadow-sm"
            >
              จ่ายงานผู้ตรวจ QA
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function QaInspectorProgressRow({ person }: { person: QaAssigneeProgress }) {
  const target = person.targetQty ?? null;
  const complete = target != null && person.doneQty >= target;
  return (
    <li className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-ti-100">
          {person.name}
          {target != null ? ` (${target} เครื่อง)` : ""}
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[11px]">
          <span className={complete ? "text-emerald-300" : "text-ember-300"}>
            ตรวจแล้ว {person.doneQty}{target != null ? `/${target}` : ""} เครื่อง
          </span>
          {complete && person.reworkPending === 0 && (
            <span className="rounded bg-emerald-500/15 px-1.5 text-emerald-300">เสร็จ</span>
          )}
          {person.reworkPending > 0 && (
            <span className="rounded border border-fail/40 bg-fail/15 px-1.5 text-fail">
              รอแก้ {person.reworkPending}
            </span>
          )}
        </span>
      </div>
      {target != null && (
        <div className="h-1 overflow-hidden rounded-full bg-carbon-700">
          <div
            className={`h-full ${complete ? "bg-emerald-400" : "bg-ember-500"}`}
            style={{ width: `${Math.min(100, (person.doneQty / target) * 100)}%` }}
          />
        </div>
      )}
    </li>
  );
}

function HeadFailedUnitsBox({
  failedUnits,
  onReload,
}: {
  failedUnits: QaFailedUnitItem[];
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
    <div className="rounded-control border border-fail/40 bg-fail/10 p-3 space-y-2 text-xs">
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
                {u.action !== "REWORK" && (
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
    item.assignees.map((a) => String(a.userId)),
  );
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredInspectors = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return inspectors;
    return inspectors.filter(
      (p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q),
    );
  }, [inspectors, query]);

  const targets = useMemo(
    () => splitAssigneeTargets(item.qaRequired, selectedIds.length),
    [item.qaRequired, selectedIds.length],
  );

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((x) => x !== id));
      return;
    }
    if (selectedIds.length >= 5) {
      setError("มอบหมายได้สูงสุด 5 คน");
      return;
    }
    setError(null);
    setSelectedIds([...selectedIds, id]);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (selectedIds.length === 0) {
      setError("กรุณาเลือกผู้ตรวจ QA อย่างน้อย 1 คน");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const assigneesPayload = selectedIds.map((uid, idx) => ({
        userId: uid,
        targetQty: targets[idx] ?? null,
      }));
      const res = await fetch("/api/qa-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assign",
          planId: item.id,
          assigneesJson: JSON.stringify(assigneesPayload),
          assigneeIds: selectedIds,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "บันทึกผู้ตรวจไม่สำเร็จ");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการบันทึก");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-panel border border-carbon-600 bg-carbon-800 p-5 space-y-4 shadow-2xl">
        <div className="flex items-start justify-between gap-2 border-b border-carbon-700 pb-3">
          <div>
            <h2 className="text-base font-semibold text-ti-50">
              จ่ายงานผู้ตรวจ QA (แผน {item.planNo})
            </h2>
            <p className="text-xs text-ti-400">
              {item.brandName} {item.modelCode} · ยอดล็อต {item.lotQty.toLocaleString("th-TH")} เครื่อง · ต้องสุ่มตรวจตาม AQL{" "}
              <strong className="font-mono text-ember-400">{item.qaRequired} เครื่อง</strong>
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
            <span className="text-ti-300">เลือกผู้ตรวจ ({selectedIds.length} คน)</span>
            <span className="font-mono text-ti-400">
              {targets.length > 0 ? targets.map((t, idx) => `คน ${idx + 1}: ${t}`).join(" · ") : "ยังไม่เลือก"}
            </span>
          </div>

          <label className="block space-y-1">
            <span className="text-xs text-ti-400">ค้นหาผู้ตรวจ QA</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="พิมพ์ชื่อหรือรหัสพนักงาน…"
              className="h-10 w-full rounded-control border border-carbon-600 bg-carbon-900 px-3 text-sm text-ti-50 placeholder:text-ti-500 focus:border-ember-500"
            />
          </label>

          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
            {filteredInspectors.length === 0 ? (
              <p className="p-4 text-center text-xs text-ti-500">
                {inspectors.length === 0
                  ? "ไม่พบผู้ใช้ในระบบที่มีบทบาท QA_INSPECTOR ที่เปิดใช้งาน"
                  : "ไม่พบรายชื่อผู้ตรวจตามที่ค้นหา"}
              </p>
            ) : (
              filteredInspectors.map((person) => {
                const selected = selectedIds.includes(person.id);
                const slotIndex = selected ? selectedIds.indexOf(person.id) + 1 : 0;
                const assignedTarget = selected ? targets[slotIndex - 1] ?? null : null;
                return (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => toggle(person.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-control border p-2.5 text-left text-xs transition-colors cursor-pointer ${
                      selected
                        ? "border-ember-500 bg-ember-500/10 text-ti-50"
                        : "border-carbon-700 bg-carbon-900/50 text-ti-300 hover:border-carbon-600"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex size-5 items-center justify-center rounded-full text-[11px] font-bold ${
                          selected
                            ? "bg-ember-500 text-carbon-950"
                            : "border border-carbon-600 bg-carbon-800 text-ti-400"
                        }`}
                      >
                        {selected ? slotIndex : "+"}
                      </span>
                      <span className="font-medium text-ti-50">{person.name}</span>
                      <span className="font-mono text-ti-400 text-[11px]">{person.code}</span>
                    </div>
                    {selected && (
                      <span className="rounded bg-ember-500/20 px-2 py-0.5 font-mono text-[11px] text-ember-300 font-semibold">
                        โควตา {assignedTarget} เครื่อง
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {error && <p className="text-xs text-fail">{error}</p>}

          <div className="flex justify-end gap-2 border-t border-carbon-700 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="h-10 rounded-control border border-carbon-600 bg-carbon-800 px-4 text-xs font-medium text-ti-300 hover:bg-carbon-700 cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving || selectedIds.length === 0}
              className="h-10 rounded-control bg-ember-500 px-4 text-xs font-bold text-carbon-900 hover:bg-ember-400 disabled:opacity-50 cursor-pointer"
            >
              {saving ? "กำลังบันทึก…" : `บันทึกการจ่ายงาน (${selectedIds.length} คน)`}
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
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/qa-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          planId: item.id,
          remarks: remarks.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "ยืนยันผลไม่สำเร็จ");
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการยืนยันผล");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-panel border border-cyan-500/50 bg-carbon-800 p-5 space-y-4 shadow-2xl">
        <div className="flex items-start justify-between gap-2 border-b border-carbon-700 pb-3">
          <div>
            <h2 className="text-base font-semibold text-ti-50">
              ยืนยันผลการสุ่มตรวจ QA (แผน {item.planNo})
            </h2>
            <p className="text-xs text-ti-400">{item.brandName} {item.modelCode}</p>
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

        <form onSubmit={handleConfirm} className="space-y-4">
          <div className="rounded-control border border-carbon-700 bg-carbon-900/70 p-3.5 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-ti-400">ยอดตามล็อต ({item.docType}):</span>
              <span className="font-mono font-semibold text-ti-50">{item.lotQty.toLocaleString("th-TH")} เครื่อง</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ti-400">เกณฑ์ AQL:</span>
              <span className="font-mono font-semibold text-ember-400">{item.aqlLevelLabel} ({item.aqlCodeLetter})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ti-400">ผลการสุ่มตรวจ QA:</span>
              <span className="font-mono font-semibold text-emerald-400">ตรวจผ่านครบ {item.qaDoneTotal}/{item.qaRequired} เครื่อง</span>
            </div>
          </div>

          <label className="block space-y-1">
            <span className="text-xs text-ti-300">หมายเหตุ / ความเห็นหัวหน้า QA (ถ้ามี)</span>
            <textarea
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="เช่น ล็อตผ่านเกณฑ์สุ่มตรวจ AQL ตามมาตรฐาน พร้อมส่งมอบ"
              className="w-full rounded-control border border-carbon-600 bg-carbon-900 p-2.5 text-xs text-ti-50 focus:border-cyan-500"
            />
          </label>

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
              type="submit"
              disabled={submitting}
              className="h-10 rounded-control bg-pass px-4 text-xs font-bold text-carbon-950 hover:brightness-105 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? "กำลังยืนยัน…" : "ยืนยันผลตรวจและปิดแผน (COMPLETED)"}
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
  const [level, setLevel] = useState<AqlLevel>(
    (item.aqlLevelLabel?.toUpperCase() as AqlLevel) || "NORMAL",
  );
  const [saveAsDefault, setSaveAsDefault] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => calculateAqlSample(level, item.lotQty), [item.lotQty, level]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/qa-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_aql",
          planId: item.id,
          aqlLevel: level,
          saveAsModelDefault: saveAsDefault,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "บันทึกเกณฑ์ AQL ไม่สำเร็จ");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการบันทึก");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-panel border border-carbon-600 bg-carbon-800 p-5 space-y-4 shadow-2xl">
        <div className="flex items-start justify-between gap-2 border-b border-carbon-700 pb-3">
          <div>
            <h2 className="text-base font-semibold text-ti-50">กำหนดเกณฑ์ AQL (แผน {item.planNo})</h2>
            <p className="text-xs text-ti-400">{item.brandName} {item.modelCode}</p>
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

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <label className="block text-xs font-medium text-ti-200">เลือกระดับ AQL</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(["REDUCED", "NORMAL", "TIGHTENED"] as const).map((lvl) => {
                const active = level === lvl;
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setLevel(lvl)}
                    className={`rounded-control border p-2.5 text-center text-xs font-medium transition-colors cursor-pointer ${
                      active
                        ? "border-ember-500 bg-ember-500/15 text-ember-300"
                        : "border-carbon-700 bg-carbon-900/60 text-ti-300 hover:border-carbon-600"
                    }`}
                  >
                    {AQL_LEVEL_LABELS[lvl]}
                  </button>
                );
              })}
            </div>
          </div>

          {preview && (
            <div className="rounded-control border border-carbon-700 bg-carbon-900/70 p-3.5 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-ti-400">ยอดทั้งล็อต ({item.docType}):</span>
                <span className="font-mono font-semibold text-ti-50">{item.lotQty.toLocaleString("th-TH")} เครื่อง</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ti-400">Code Letter:</span>
                <span className="font-mono font-semibold text-ember-400">{preview.codeLetter}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ti-400">ยอดที่ต้องสุ่มตรวจ (Sample Size):</span>
                <span className="font-mono font-bold text-base text-emerald-400">{preview.qaRequired} เครื่อง</span>
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-ti-300 cursor-pointer">
            <input
              type="checkbox"
              checked={saveAsDefault}
              onChange={(e) => setSaveAsDefault(e.target.checked)}
              className="rounded border-carbon-600 bg-carbon-900 text-ember-500 focus:ring-0"
            />
            <span>บันทึกเป็นเกณฑ์เริ่มต้นของโมเดล {item.modelCode}</span>
          </label>

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
              type="submit"
              disabled={submitting || !preview}
              className="h-10 rounded-control bg-ember-500 px-4 text-xs font-bold text-carbon-900 hover:bg-ember-400 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? "กำลังบันทึก…" : `บันทึกเกณฑ์ AQL (${preview?.qaRequired ?? 0} เครื่อง)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
