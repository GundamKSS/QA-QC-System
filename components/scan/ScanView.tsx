"use client";

import { useState } from "react";
import { AppBack } from "@/components/ui/AppBack";
import { CameraScanDialog } from "@/components/scan/CameraScanDialog";
import { StartInspectionModal, type WorkOrderInfo } from "@/components/inspections/StartInspectionModal";
import { CardsSkeleton } from "@/components/feedback/CardsSkeleton";
import { LoadError } from "@/components/feedback/LoadError";
import { useJobsData } from "@/components/jobs/useJobsData";
import { OPEN_WORK_ORDER_STATUSES } from "@/lib/plans/rules";
import { isJobCompletedForUser } from "@/lib/scan/rules";
import type { JobItem } from "@/lib/plans/jobs";
import type { ScanLookupResult } from "@/lib/scan/service";
import type { SerialEntryMode } from "@/lib/inspections/types";
import { playScanSuccessSound, triggerScanHaptic } from "@/lib/scan/feedback";

export function ScanView() {
  const { data: jobsPayload, loading: jobsLoading, error: jobsError, reload: reloadJobs } = useJobsData("mine", null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanLookupResult | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [entryMode, setEntryMode] = useState<SerialEntryMode>("SCAN_CAMERA");
  const [selectedSerial, setSelectedSerial] = useState<string>("");
  const [inspectingJob, setInspectingJob] = useState<WorkOrderInfo | null>(null);

  const me = jobsPayload?.me ?? null;

  // Active open jobs available for inspection (filtering out jobs where the user already completed their quota or is not an assignee)
  const availableJobs: JobItem[] = (scanResult?.availableJobs ?? jobsPayload?.jobs ?? []).filter(
    (job) =>
      OPEN_WORK_ORDER_STATUSES.includes(job.status) &&
      !isJobCompletedForUser(job, me) &&
      (job.assignees.length === 0 || (me ? job.assignees.some((p) => String(p.userId) === String(me)) : false)),
  );

  async function handleLookup(code: string, mode: SerialEntryMode) {
    const trimmed = code.trim();
    if (!trimmed) return;

    setLookingUp(true);
    setLookupError(null);
    setEntryMode(mode);

    try {
      const response = await fetch("/api/scan/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });

      const json = await response.json();
      if (!response.ok || json.status !== "done") {
        setLookupError(json.message || "ไม่สามารถค้นหาข้อมูลจากรหัสนี้ได้");
        setScanResult(null);
      } else {
        const res: ScanLookupResult = json.result;
        setScanResult(res);
        playScanSuccessSound();
        triggerScanHaptic("success");
        if (res.kind === "INTERNAL_PUMP") {
          setSelectedSerial(res.parsed.serial);
        } else {
          setSelectedSerial(res.serial);
        }
      }
    } catch {
      setLookupError("เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง");
      setScanResult(null);
    } finally {
      setLookingUp(false);
    }
  }

  function handleCameraRead(code: string) {
    setCameraOpen(false);
    handleLookup(code, "SCAN_CAMERA");
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleLookup(manualCode, "SCAN_WEDGE");
  }

  function handleReset() {
    setScanResult(null);
    setLookupError(null);
    setManualCode("");
    setSelectedSerial("");
  }

  function openJobInspection(job: JobItem, serial: string) {
    setInspectingJob({
      id: job.id,
      woNo: job.woNo,
      planId: job.planId,
      modelCode: job.modelCode,
      description: job.description,
      qtyNeed: job.qtyNeed,
      qtyDone: job.qtyDone,
      vendorName: job.vendorName,
    });
    setSelectedSerial(serial);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
      <AppBack href="/home">กลับหน้าหลัก</AppBack>
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-ti-50 sm:text-2xl">สแกนตรวจเครื่อง</h1>
        <p className="mt-1 text-xs text-ti-400 sm:text-sm">
          สแกน QR หรือบาร์โค้ดบนตัวปั๊ม/มอเตอร์ เพื่อเปิดใบงานและเริ่มตรวจได้ทันที
        </p>
      </div>

      {jobsError && <LoadError message={jobsError} onRetry={reloadJobs} />}

      {/* Camera Dialog */}
      {cameraOpen && (
        <CameraScanDialog
          title="สแกน QR / บาร์โค้ดเครื่อง"
          hint="เล็งกล้องไปที่ QR ฝั่งขวาของสติ๊กเกอร์ (ปั๊มผลิตเอง) หรือบาร์โค้ดบนตัวเครื่อง"
          onRead={handleCameraRead}
          onClose={() => setCameraOpen(false)}
        />
      )}

      {/* Main Scanner Action Card */}
      {!scanResult && (
        <div className="rounded-card border border-carbon-700/80 bg-carbon-800/90 p-5 shadow-lg backdrop-blur">
          {/* Quick Camera Action */}
          <button
            type="button"
            onClick={() => setCameraOpen(true)}
            className="flex w-full items-center justify-center gap-3 rounded-control bg-ember-500 py-3.5 px-4 text-base font-semibold text-carbon-950 shadow-md hover:bg-ember-400 active:scale-[0.99] transition"
          >
            <svg aria-hidden="true" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            เปิดกล้องสแกนทันที
          </button>

          {/* Divider */}
          <div className="relative my-5 text-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-carbon-700" />
            </div>
            <span className="relative bg-carbon-800 px-3 text-xs text-ti-400">หรือพิมพ์ / ยิงด้วยเครื่องสแกน</span>
          </div>

          {/* Keyboard Wedge / Manual Input */}
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="ยิงบาร์โค้ด หรือพิมพ์ข้อความใน QR / Serial..."
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              className="h-11 flex-1 rounded-control border border-carbon-600 bg-carbon-900 px-3.5 font-mono text-sm text-ti-50 placeholder:text-ti-500 focus:outline-none focus:ring-2 focus:ring-ember-500/50"
            />
            <button
              type="submit"
              disabled={lookingUp || !manualCode.trim()}
              className="h-11 shrink-0 rounded-control border border-ti-600 bg-carbon-700 px-4 text-sm font-medium text-ti-100 hover:bg-carbon-600 active:scale-95 disabled:opacity-40 transition"
            >
              {lookingUp ? "กำลังตรวจ..." : "ค้นหา"}
            </button>
          </form>

          {/* Quick Info Tips */}
          <div className="mt-4 space-y-1.5 rounded-control bg-carbon-900/60 p-3 text-xs text-ti-400">
            <p className="flex items-start gap-1.5">
              <span className="text-ember-400 shrink-0">✦</span>
              <span><strong>ปั๊มผลิตเอง:</strong> สแกน QR ขวาบนสติ๊กเกอร์ ระบบจะดึงเลข WO, Model และวิ่งเข้าใบงานให้อัตโนมัติ</span>
            </p>
            <p className="flex items-start gap-1.5">
              <span className="text-sky-400 shrink-0">✦</span>
              <span><strong>ปั๊มนำเข้า / ทั่วไป:</strong> สแกน Serial แล้วจิ้มเลือกใบงานที่ต้องการตรวจได้ทันที</span>
            </p>
          </div>
        </div>
      )}

      {/* Loading state */}
      {lookingUp && (
        <div className="my-6">
          <CardsSkeleton label="กำลังค้นหาข้อมูลจากรหัสที่สแกน..." />
        </div>
      )}

      {/* Lookup Error Banner */}
      {lookupError && (
        <div className="my-4 rounded-card border border-fail/40 bg-fail/10 p-4 text-fail text-sm">
          <p className="font-medium">เกิดข้อผิดพลาดในการค้นหา:</p>
          <p className="mt-1 text-xs">{lookupError}</p>
          <button
            type="button"
            onClick={handleReset}
            className="mt-3 text-xs underline hover:text-ti-50"
          >
            ← สแกนใหม่อีกครั้ง
          </button>
        </div>
      )}

      {/* Result Section: In-house Pump (Auto-match) */}
      {scanResult && scanResult.kind === "INTERNAL_PUMP" && (
        <div className="my-4 space-y-4">
          <div className="rounded-card border border-pass/40 bg-carbon-800/90 p-5 shadow-lg">
            <div className="flex items-center justify-between border-b border-carbon-700/80 pb-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-pass animate-pulse" />
                <span className="text-xs font-semibold uppercase tracking-wider text-pass">ปั๊มผลิตเอง (TRW/PUMA)</span>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="text-xs text-ti-400 hover:text-ti-100 underline"
              >
                สแกนใหม่
              </button>
            </div>

            {/* Parsed Details Summary */}
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:text-sm">
              <div className="rounded-control bg-carbon-900/60 p-2.5">
                <span className="block text-[11px] text-ti-400">Model</span>
                <span className="font-semibold text-ti-50">{scanResult.parsed.modelCode}</span>
              </div>
              <div className="rounded-control bg-carbon-900/60 p-2.5">
                <span className="block text-[11px] text-ti-400">เลขที่ผลิต (WO)</span>
                <span className="font-mono font-semibold text-ember-400">{scanResult.parsed.woNo}</span>
              </div>
              <div className="rounded-control bg-carbon-900/60 p-2.5">
                <span className="block text-[11px] text-ti-400">Serial ปั๊ม</span>
                <span className="font-mono font-semibold text-ti-50">{scanResult.parsed.serial}</span>
              </div>
              <div className="rounded-control bg-carbon-900/60 p-2.5">
                <span className="block text-[11px] text-ti-400">แผนก / วันที่</span>
                <span className="text-ti-200">MT-{scanResult.parsed.department} · {scanResult.parsed.productionDate}</span>
              </div>
            </div>

            {/* Sub-case 1: Matched Job Found! */}
            {scanResult.matchedJob ? (
              <div className="mt-5 rounded-card border border-ember-500/50 bg-ember-500/10 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">✨</span>
                    <span className="text-sm font-semibold text-ember-300">พบใบงานที่ตรงกันอัตโนมัติ!</span>
                  </div>
                  <span className="rounded-full bg-ember-500/20 px-2.5 py-0.5 text-xs font-medium text-ember-300">
                    {scanResult.matchedJob.woNo}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-ti-300">
                  <span>ความคืบหน้าของใบงาน:</span>
                  <span className="font-medium text-ti-100">
                    {scanResult.matchedJob.qtyDone} / {scanResult.matchedJob.qtyNeed} เครื่อง
                  </span>
                </div>

                {/* 1-Click Action to start inspection immediately */}
                <button
                  type="button"
                  onClick={() => openJobInspection(scanResult.matchedJob!, scanResult.parsed.serial)}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-control bg-ember-500 py-3 text-sm font-semibold text-carbon-950 shadow-md hover:bg-ember-400 active:scale-[0.99] transition"
                >
                  เริ่มตรวจเครื่องนี้ทันที
                  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
              </div>
            ) : scanResult.completedNote ? (
              /* Sub-case 2: User already completed their assigned quota for this job */
              <div className="mt-5 rounded-card border border-pass/40 bg-pass/10 p-4 text-xs text-ti-100">
                <div className="flex items-center gap-2 text-pass font-semibold">
                  <span className="text-base">✓</span>
                  <span>ตรวจครบตามยอดที่ได้รับมอบหมายแล้ว</span>
                </div>
                <p className="mt-1.5 text-ti-300">
                  {scanResult.completedNote} — ยอดในส่วนที่คุณได้รับมอบหมายตรวจครบเรียบร้อยแล้ว ไม่ต้องตรวจเพิ่มค่ะ ✨
                </p>
              </div>
            ) : (
              /* Sub-case 3: In-house pump but no active job found */
              <div className="mt-5 rounded-card border border-ti-700 bg-carbon-900/80 p-4 text-xs text-ti-300">
                <p className="font-semibold text-ti-100">⚠️ ไม่พบใบงานที่ตรงกับ WO {scanResult.parsed.woNo} ในรายการงานของคุณ</p>
                <p className="mt-1 text-ti-400">
                  คุณสามารถเลือกใบงานอื่นของคุณด้านล่างนี้เพื่อนำ Serial {scanResult.parsed.serial} ไปเริ่มตรวจได้ค่ะ:
                </p>
              </div>
            )}
          </div>

          {/* Fallback Job Selection for In-house pump if not matched or if user wants to change */}
          {!scanResult.matchedJob && availableJobs.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold text-ti-200 mb-3">เลือกใบงานที่ต้องการตรวจ:</h2>
              <div className="space-y-2.5">
                {availableJobs.map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => openJobInspection(job, scanResult.parsed.serial)}
                    className="flex w-full items-center justify-between rounded-card border border-carbon-700/80 bg-carbon-800/80 p-3.5 text-left hover:border-ember-500/60 hover:bg-carbon-700/60 active:scale-[0.99] transition"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ti-50">{job.modelCode}</span>
                        <span className="font-mono text-xs text-ember-400">{job.woNo}</span>
                      </div>
                      <p className="mt-1 text-xs text-ti-400">{job.description || job.vendorName || "—"}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-ti-300">{job.qtyDone}/{job.qtyNeed} เครื่อง</span>
                      <span className="block text-[11px] text-ember-400 font-medium mt-0.5">กดตรวจ →</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Result Section: Imported Pump or Generic Barcode */}
      {scanResult && scanResult.kind === "GENERIC_OR_IMPORTED" && (
        <div className="my-4 space-y-4">
          <div className="rounded-card border border-sky-500/40 bg-carbon-800/90 p-5 shadow-lg">
            <div className="flex items-center justify-between border-b border-carbon-700/80 pb-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-sky-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-sky-300">
                  รายละเอียดที่สแกนพบ
                </span>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="text-xs text-ti-400 hover:text-ti-100 underline"
              >
                สแกนใหม่
              </button>
            </div>

            <div className="mt-4 rounded-control bg-carbon-900/70 p-3.5">
              <span className="block text-[11px] text-ti-400">หมายเลข Serial / รหัสที่อ่านได้</span>
              <span className="font-mono text-base font-bold text-ti-50">{scanResult.serial}</span>
            </div>

            <p className="mt-4 text-xs font-medium text-ti-200">
              👇 กรุณากดเลือกใบงานที่ต้องการนำรหัสนี้ไปเริ่มตรวจ:
            </p>
          </div>

          {/* Job Selection Cards for Imported / Generic */}
          {availableJobs.length > 0 ? (
            <div className="space-y-2.5">
              {availableJobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => openJobInspection(job, scanResult.serial)}
                  className="flex w-full items-center justify-between rounded-card border border-carbon-700/80 bg-carbon-800/90 p-4 text-left hover:border-ember-500/70 hover:bg-carbon-700/70 active:scale-[0.99] transition"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-ti-50">{job.modelCode}</span>
                      <span className="font-mono text-xs text-ember-400">{job.woNo}</span>
                    </div>
                    <p className="mt-1 text-xs text-ti-400 line-clamp-1">{job.description || job.vendorName || "—"}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-ti-300">{job.qtyDone} / {job.qtyNeed} ตรวจแล้ว</span>
                    <span className="block text-xs font-semibold text-ember-400 mt-1">เลือกใบงานนี้ →</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-card border border-carbon-700 bg-carbon-800/60 p-6 text-center text-xs text-ti-400">
              ไม่พบใบงานที่พร้อมตรวจในขณะนี้ กรุณาตรวจสอบในหน้า &quot;งานของฉัน&quot; หรือติดต่อหัวหน้างานค่ะ
            </div>
          )}
        </div>
      )}

      {/* Available Jobs list at initial idle state */}
      {!scanResult && !lookingUp && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ti-400">
              ใบงานของคุณที่พร้อมตรวจ ({availableJobs.length})
            </h2>
            <button
              type="button"
              onClick={reloadJobs}
              className="text-xs text-ti-500 hover:text-ti-300"
            >
              รีเฟรช
            </button>
          </div>

          {jobsLoading && availableJobs.length === 0 ? (
            <CardsSkeleton label="กำลังโหลดใบงาน..." />
          ) : availableJobs.length > 0 ? (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {availableJobs.map((job) => (
                <div
                  key={job.id}
                  className="rounded-card border border-carbon-700/60 bg-carbon-800/50 p-3.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-ti-100 text-sm">{job.modelCode}</span>
                    <span className="font-mono text-xs text-ember-400">{job.woNo}</span>
                  </div>
                  <p className="mt-1 text-xs text-ti-400 line-clamp-1">{job.description || job.vendorName || "—"}</p>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-ti-400 border-t border-carbon-700/40 pt-2">
                    <span>ความคืบหน้า:</span>
                    <span className="font-mono text-ti-200">{job.qtyDone}/{job.qtyNeed}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ti-500 italic">ไม่มีใบงานค้างตรวจในขณะนี้</p>
          )}
        </div>
      )}

      {/* Start Inspection Modal */}
      {inspectingJob && (
        <StartInspectionModal
          isOpen={inspectingJob !== null}
          workOrder={inspectingJob}
          initialSerial={selectedSerial}
          initialEntryMode={entryMode}
          onClose={() => setInspectingJob(null)}
        />
      )}
    </div>
  );
}
