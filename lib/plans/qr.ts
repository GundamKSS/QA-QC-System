import { DEPARTMENTS } from "./service";
import type { ModelInfo } from "./store";

/**
 * The QR on the right of an in-house pump's sticker (docs/03 BR-18): eight fields split by `|`, e.g.
 * `5x3 HP 260L. (PP-23P) + …|FG1004-000675|WC:WMT-409|MODEL:PP-23P|FIC:FG-MT-00156|Date:2569/10/22|WO1274/69|SN69/00014-15`.
 * Pure on purpose: the open-plan form parses what a scanner types and fills itself from the result, and the
 * server never sees the code, only the form values it produces.
 */
export type PumpQr = {
  description: string;
  /** FG product code. Parsed so it is there when a place to keep it exists; nothing stores it yet. */
  productId: string;
  department: (typeof DEPARTMENTS)[number];
  modelCode: string;
  /** ISO date in ค.ศ.; the sticker prints พ.ศ. */
  productionDate: string;
  /** The production order (เลขที่ผลิต), which becomes the plan's document number. */
  woNo: string;
  serial: string;
  /** The number after the dash of the serial: how many machines this work order makes (A3b). */
  lotQty: number;
};

export type PumpQrResult = { ok: true; data: PumpQr } | { ok: false; message: string };

const FIELD_COUNT = 8;
const fail = (message: string): PumpQrResult => ({ ok: false, message });
const shown = (value: string) => `“${value.slice(0, 40)}”`;

/** พ.ศ. → ค.ศ. when the year is plainly Buddhist (≥ 2400); a printer already on ค.ศ. is taken as it is. */
function isoDate(year: string, month: string, day: string): string | null {
  const christian = Number(year) >= 2400 ? Number(year) - 543 : Number(year);
  const iso = `${String(christian).padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  // Date rolls 30 Feb over to March, so a real date is one that survives the round trip.
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(iso) ? iso : null;
}

/**
 * Reads what a scanner (or a paste) delivered. The fields the plan depends on are checked one by one, each with its
 * own Thai sentence; FIC is skipped because it is not used (user, 22 Oct 2026).
 */
export function parsePumpQr(raw: string): PumpQrResult {
  // A keyboard-wedge scanner ends with Enter and some add a BOM; neither is part of the code.
  const text = raw.replace(/^﻿/, "").trim();
  if (!text) return fail("ไม่พบข้อมูลจาก QR — สแกนใหม่อีกครั้ง");
  if (/^https?:\/\//i.test(text)) return fail("นี่คือ QR ฝั่งซ้าย (เว็บไซต์) — ให้สแกน QR ฝั่งขวาของสติ๊กเกอร์");

  const parts = text.split("|").map((part) => part.trim());
  if (parts.length !== FIELD_COUNT) {
    // A scanner typing under a Thai keyboard layout turns `|` into a Thai letter, which lands here too.
    return fail(`QR นี้ไม่ใช่สติ๊กเกอร์ปั๊มผลิตเอง (ต้องมี ${FIELD_COUNT} ช่องคั่นด้วย |) — ตรวจว่าแป้นพิมพ์เป็นภาษาอังกฤษขณะสแกน`);
  }
  const [description, productId, workCenter, model, , date, wo, serial] = parts;

  const center = /^WC:W?MT-(\d{3})$/i.exec(workCenter);
  if (!center) return fail(`ช่องแผนกผลิต (WC) ใน QR ไม่ถูกต้อง ${shown(workCenter)}`);
  const department = DEPARTMENTS.find((item) => item === center[1]);
  if (!department) return fail(`แผนก ${center[1]} ใน QR ไม่อยู่ในระบบ (รองรับ ${DEPARTMENTS.join(", ")})`);

  const modelCode = /^MODEL:\s*(\S.*)$/i.exec(model)?.[1].trim();
  if (!modelCode) return fail(`ช่อง Model ใน QR ไม่ถูกต้อง ${shown(model)}`);

  const dateParts = /^Date:\s*(\d{4})\/(\d{1,2})\/(\d{1,2})$/i.exec(date);
  const productionDate = dateParts ? isoDate(dateParts[1], dateParts[2], dateParts[3]) : null;
  if (!productionDate) return fail(`วันที่ผลิตใน QR ไม่ถูกต้อง ${shown(date)}`);

  // Looser than today's `WO1274/69` on purpose: department 408 has not shown its sticker yet (A3c), and
  // refusing a slightly different number would block opening the plan.
  if (!/^WO[A-Z0-9][A-Z0-9./-]{0,61}$/i.test(wo)) return fail(`เลขที่ผลิต (WO) ใน QR ไม่ถูกต้อง ${shown(wo)}`);

  const serialParts = /^SN(\d{2,4})\/(\d{1,6})-(\d{1,6})$/i.exec(serial);
  const lotQty = serialParts ? Number(serialParts[3]) : 0;
  if (lotQty < 1) return fail(`Serial ใน QR ไม่ถูกต้อง ${shown(serial)}`);

  return { ok: true, data: { description, productId, department, modelCode, productionDate, woNo: wo, serial, lotQty } };
}

/** What the open-plan form sets after a scan; strings because that is what its inputs hold. */
export type QrFill = {
  docType: "PO";
  docNo: string;
  department: string;
  /** The production date goes to "วันที่ PO" (user default, 28 Oct 2026). */
  docDate: string;
  /** The `<select>` value, or "" when no Model matched so the person picks one. */
  modelId: string;
  description: string;
  lotQty: string;
  /** Things to look at before saving, in Thai. */
  warnings: string[];
};

type ModelChoice = Pick<ModelInfo, "id" | "code" | "origin" | "isActive" | "description">;

const codeKey = (code: string) => code.normalize("NFKC").trim().toUpperCase();

export function fillFromQr(data: PumpQr, models: readonly ModelChoice[]): QrFill {
  const sameCode = models.filter((item) => item.isActive && codeKey(item.code) === codeKey(data.modelCode));
  const model = sameCode.find((item) => item.origin === "DOMESTIC");
  const warnings: string[] = [];
  if (!model) {
    warnings.push(
      sameCode.length > 0
        ? `Model ${data.modelCode} เป็นปั๊มนำเข้า ไม่ใช่ผลิตเอง — เลือก Model เอง`
        : `ไม่พบ Model ${data.modelCode} ที่ใช้งานอยู่ในรายการผลิตเอง — เลือก Model เอง หรือให้ Master Admin เพิ่ม Model นี้ก่อน`,
    );
  }
  return {
    docType: "PO",
    docNo: data.woNo,
    department: data.department,
    docDate: data.productionDate,
    modelId: model ? String(model.id) : "",
    // The sticker's own wording wins over the Model's default; the Model only fills a blank.
    description: data.description || model?.description || "",
    lotQty: String(data.lotQty),
    warnings,
  };
}
