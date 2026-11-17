import "server-only";

import type { SessionUser } from "@/lib/auth/types";
import { loadJobs, type JobItem } from "@/lib/plans/jobs";
import { parsePumpQr, type PumpQr } from "@/lib/plans/qr";
import { OPEN_WORK_ORDER_STATUSES } from "@/lib/plans/rules";
import { isJobCompletedForUser } from "./rules";

export type ScanLookupResult =
  | {
      kind: "INTERNAL_PUMP";
      rawCode: string;
      parsed: PumpQr;
      matchedJob: JobItem | null;
      completedNote?: string | null;
      availableJobs: JobItem[];
    }
  | {
      kind: "GENERIC_OR_IMPORTED";
      rawCode: string;
      serial: string;
      matchedJob: null;
      completedNote?: string | null;
      availableJobs: JobItem[];
    };

/**
 * Looks up what a scanner read (Camera, USB keyboard wedge, or manual input):
 * 1. If it matches an in-house pump sticker QR (8 parts separated by '|'),
 *    parses it and attempts to automatically match an open Work Order in the user's jobs.
 *    If the user has already inspected their assigned quota for this job, it will NOT match or prompt for more.
 * 2. If it is an imported pump or generic serial/barcode, extracts the clean code
 *    and provides the list of available active Work Orders (excluding completed ones) for 1-click selection.
 */
export async function lookupScan(user: SessionUser, rawCode: string): Promise<ScanLookupResult> {
  const code = rawCode.trim();
  const isDevUser = user.id === "2" || user.employeeCode === "DEV" || user.employeeCode === "TRW0002";
  const jobsPayload = await loadJobs(user, "mine");
  const me = jobsPayload.me;

  // Filter open jobs that this user is assigned to AND has NOT completed yet
  const isAssignedToUser = (job: JobItem) =>
    !isDevUser &&
    (job.assignees.length === 0 || (me ? job.assignees.some((p) => String(p.userId) === String(me)) : false));

  const openJobs = isDevUser
    ? []
    : jobsPayload.jobs.filter(
        (j) =>
          OPEN_WORK_ORDER_STATUSES.includes(j.status) &&
          !isJobCompletedForUser(j, me) &&
          isAssignedToUser(j),
      );

  const qrResult = parsePumpQr(code);
  if (qrResult.ok) {
    const parsed = qrResult.data;
    const woNorm = parsed.woNo.toLowerCase().trim();
    const modelNorm = parsed.modelCode.toLowerCase().trim();

    // If Dev user, show parsed details but do not allow claim
    if (isDevUser) {
      return {
        kind: "INTERNAL_PUMP",
        rawCode: code,
        parsed,
        matchedJob: null,
        completedNote: "ผู้ใช้ Dev มีสิทธิ์เข้าดูข้อมูลเท่านั้น — การตรวจเครื่องต้องทำโดยผู้รับผิดชอบที่ได้รับมอบหมาย",
        availableJobs: [],
      };
    }

    const cleanWo = woNorm.replace(/^wo/i, "");
    const isMatchingJob = (job: JobItem) => {
      const doc = (job.docNo ?? "").toLowerCase().trim();
      const wo = (job.woNo ?? "").toLowerCase().trim();
      const cleanDoc = doc.replace(/^wo/i, "");
      const cleanJobWo = wo.replace(/^wo/i, "");
      const modelMatch = job.modelCode ? job.modelCode.toLowerCase().trim() === modelNorm : false;
      const woMatch = doc === woNorm || wo === woNorm || (cleanWo && (cleanDoc === cleanWo || cleanJobWo === cleanWo));
      return Boolean(woMatch && modelMatch);
    };

    // Check if the user already completed a matching work order
    const completedJob = jobsPayload.jobs.find((job) => isMatchingJob(job) && isJobCompletedForUser(job, me));

    // Try finding an active open work order where user has quota remaining
    let matched = openJobs.find((job) => isMatchingJob(job));

    // If not found in user's assigned active jobs, but user is QC_HEAD, check all jobs
    if (!matched && !completedJob && user.roles.includes("QC_HEAD")) {
      const allPayload = await loadJobs(user, "all");
      const allOpen = allPayload.jobs.filter(
        (j) => OPEN_WORK_ORDER_STATUSES.includes(j.status) && !isJobCompletedForUser(j, me),
      );
      matched = allOpen.find((job) => isMatchingJob(job));
    }

    const completedNote = completedJob
      ? `คุณตรวจครบตามยอดที่ได้รับมอบหมายในใบงาน ${completedJob.woNo} แล้ว (${completedJob.modelCode})`
      : null;

    return {
      kind: "INTERNAL_PUMP",
      rawCode: code,
      parsed,
      matchedJob: matched ?? null,
      completedNote,
      availableJobs: openJobs,
    };
  }

  // Generic or imported barcode / serial
  const cleanSerial = code.replace(/^﻿/, "").trim();

  return {
    kind: "GENERIC_OR_IMPORTED",
    rawCode: code,
    serial: cleanSerial,
    matchedJob: null,
    availableJobs: openJobs,
  };
}
