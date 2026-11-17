"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useApiAction } from "@/lib/api/client";
import { parseOpenPlanForm, type OpenPlanFormValues } from "@/lib/plans/form";
import type { OpenPlanPrefill } from "@/lib/plans/open-query";
import { lookupReceiptDocRemote, type DocLookupResult } from "@/lib/plans/lookup-client";
import type { QrFill } from "@/lib/plans/qr";
import { daysLeft, normalizeDocNo, qcDeadline, qcRequired } from "@/lib/plans/rules";
import type { OpenPlanFormState } from "@/lib/plans/state";
import type { OpenOptions, QcSettings } from "@/lib/plans/store";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { PlanQrScan } from "./PlanQrScan";

export type Prefill = OpenPlanPrefill;

type Props = { options: OpenOptions; settings: QcSettings; today: string; prefill: Prefill };
type Lookup = { key: string; result: DocLookupResult };

const idle: OpenPlanFormState = { status: "idle" };
/** No usable answer (network down): refuse in the form's own words and keep what was typed, read back from the sent form. */
const failed = (message: string, formData: FormData): OpenPlanFormState => ({
  status: "error",
  message,
  values: parseOpenPlanForm((key) => { const value = formData.get(key); return typeof value === "string" ? value : null; }).values,
  at: Date.now(),
});
const inputClass =
  "h-11 w-full scroll-mb-52 rounded-control border border-carbon-600 bg-carbon-900 px-3 text-sm text-ti-50 placeholder:text-ti-500 focus:border-ember-500 aria-invalid:border-red-400 disabled:opacity-60 lg:scroll-mb-0";
const sectionClass = "space-y-4 app-panel rounded-panel border border-carbon-700 bg-carbon-800 p-4 sm:p-5";
const DEPARTMENTS = ["408", "409"];
const dateText = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const lotOf = (raw: string) => {
  const value = raw.replace(/,/g, "").trim();
  return /^\d{1,7}$/.test(value) && Number(value) > 0 ? Number(value) : null;
};

/** Open-plan form (docs/14). `POST /api/plans` decides; numbers here are a live preview with the same rules. */
export function OpenPlanForm(props: Props) {
  const [state, action, pending] = useApiAction("/api/plans", idle, failed);
  // React resets a form after its action; re-keying restores what was typed when the server says no.
  return <FormBody key={state.status === "idle" || state.status === "done" ? "initial" : state.at} {...props} state={state} action={action} pending={pending} />;
}

function FormBody({ options, settings, today, prefill, state, action, pending }: Props & { state: OpenPlanFormState; action: (data: FormData) => void; pending: boolean }) {
  const base = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const echoed: Partial<OpenPlanFormValues> = state.status === "idle" || state.status === "done" ? {} : state.values;
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  const [docType, setDocType] = useState<"INVOICE" | "PO">(echoed.docType === "PO" || (!echoed.docType && prefill.docType === "PO") ? "PO" : "INVOICE");
  const pumaVendor = () => String(options.vendors.find((item) => /puma/i.test(item.name))?.id ?? "");
  const modelVendor = (id: string) => {
    const linked = options.models.find((item) => String(item.id) === id)?.vendorId;
    return linked ? String(linked) : "";
  };
  const [vendorId, setVendorId] = useState(() => echoed.vendorId ?? (prefill.vendorId || (docType === "PO" ? pumaVendor() : "")));
  const [docNo, setDocNo] = useState(echoed.docNo ?? prefill.docNo);
  const [modelId, setModelId] = useState(echoed.modelId ?? "");
  const [description, setDescription] = useState(echoed.description ?? "");
  const [lotQty, setLotQty] = useState(echoed.lotQty ?? "");
  const [invoiceDate, setInvoiceDate] = useState(echoed.invoiceDate ?? "");
  // Held in state (not `defaultValue`) so a scanned sticker can fill them.
  const [department, setDepartment] = useState(echoed.department ?? "");
  const [docDate, setDocDate] = useState(echoed.docDate ?? "");
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [checking, setChecking] = useState(false);
  const latest = useRef("");

  // BR-01: a document is its type + number; the vendor is optional and belongs to the document (db/013).
  const keyOf = (type: string, no: string) => `${type}|${normalizeDocNo(no)}`;
  const currentKey = keyOf(docType, docNo);

  async function check(type: string, no: string) {
    const key = keyOf(type, no);
    latest.current = key;
    if (!no.trim()) return;
    setChecking(true);
    try {
      const result = await lookupReceiptDocRemote(type, no);
      if (latest.current === key) setLookup({ key, result });
    } catch {
      if (latest.current === key) setLookup({ key, result: { kind: "error", message: "ตรวจเอกสารไม่สำเร็จ — ลองใหม่อีกครั้ง" } });
    } finally {
      if (latest.current === key) setChecking(false);
    }
  }

  // Coming back with a document (K4 "เปิด Model ถัดไป" or a failed save): check it once.
  const initial = useRef({ docType, docNo });
  useEffect(() => {
    const { docType: type, docNo: no } = initial.current;
    if (no.trim()) void check(type, no);
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per mount
  }, []);

  const origin = docType === "INVOICE" ? "IMPORTED" : "DOMESTIC";
  const models = options.models.filter((model) => model.origin === origin);
  const model = models.find((item) => String(item.id) === modelId) ?? null;
  const result = lookup?.key === currentKey ? lookup.result : null;
  const found = result?.kind === "found" ? result : null;
  const duplicate = found && model ? found.plans.find((plan) => plan.modelId === model.id) : undefined;

  const lot = lotOf(lotQty);
  const qc = lot ? qcRequired(lot, settings.qcPercent) : null;
  const effectiveInvoiceDate = found ? found.header.invoiceDate : invoiceDate;
  let deadline: string | null = null;
  if (docType === "INVOICE" && effectiveInvoiceDate) {
    try {
      deadline = found?.header.qcDeadline ?? qcDeadline(effectiveInvoiceDate, settings.deadlineDays);
    } catch {
      deadline = null;
    }
  }
  const left = deadline ? daysLeft(deadline, today) : null;

  function changeDocType(next: "INVOICE" | "PO") {
    setDocType(next);
    const nextOrigin = next === "INVOICE" ? "IMPORTED" : "DOMESTIC";
    if (model && model.origin !== nextOrigin) {
      setModelId("");
      setDescription("");
    }
    if (next === "PO" && !vendorId) setVendorId(pumaVendor());
    void check(next, docNo);
  }

  function changeModel(id: string) {
    setModelId(id);
    setDescription(options.models.find((item) => String(item.id) === id)?.description ?? "");
    // The model's own vendor is the default — the user can still pick another (a document that exists keeps its vendor).
    const linked = modelVendor(id);
    if (linked && !found) setVendorId(linked);
  }

  /** A scanned sticker (docs/03 BR-18) sets the whole PO form at once; everything it sets can still be edited. */
  function applyScan(fill: QrFill) {
    setDocType(fill.docType);
    setDocNo(fill.docNo);
    setDepartment(fill.department);
    setDocDate(fill.docDate);
    setModelId(fill.modelId);
    setDescription(fill.description);
    setLotQty(fill.lotQty);
    const scannedVendor = modelVendor(fill.modelId) || (fill.docType === "PO" ? pumaVendor() : "");
    if (scannedVendor) setVendorId(scannedVendor);
    void check(fill.docType, fill.docNo);
  }

  const isDocReady = Boolean(docNo.trim());
  const docBorderClass =
    isDocReady && result?.kind === "new"
      ? "!border-emerald-500 focus:!border-emerald-400 focus:ring-1 focus:ring-emerald-500/30"
      : isDocReady && (result?.kind === "found" || result?.kind === "error")
      ? "!border-red-500 focus:!border-red-400 focus:ring-1 focus:ring-red-500/30"
      : "";

  const field = (name: keyof OpenPlanFormValues) => ({
    name,
    id: `${base}-${name}`,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${base}-${name}-e` : undefined,
  });

  const missing: string[] = [];
  if (!docNo.trim()) missing.push(docType === "INVOICE" ? "เลข Invoice" : "เลข PO");
  if (!model) missing.push("Model");
  if (!found && !vendorId) missing.push("Vendor");
  if (!lot) missing.push("จำนวน");
  const blocked = Boolean(duplicate) || pending;

  return (
    <form ref={formRef} action={action} aria-labelledby={`${base}-title`} noValidate className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <h2 id={`${base}-title`} className="sr-only">ฟอร์มเปิดแผนตรวจ</h2>
      <div className="min-w-0 space-y-5">
        {state.status === "error" && (
          <p role="alert" className="rounded-control border border-red-500/50 bg-carbon-800 px-3 py-2 text-sm text-red-300">{state.message}</p>
        )}
        {state.status === "duplicate" && (
          <p role="alert" className="rounded-control border border-ember-500/60 bg-carbon-800 px-3 py-2 text-sm text-ember-400">
            แผนนี้เปิดแล้ว: <span className="font-mono font-semibold">{state.planNo}</span> — 1 Model เปิดได้ 1 แผนต่อเอกสาร ·{" "}
            <Link href={`/plans/${state.planId}`} className="underline underline-offset-4 hover:text-ember-500">ไปที่แผนเดิม</Link>
          </p>
        )}

        <PlanQrScan models={options.models} onFill={applyScan} />

        <section aria-labelledby={`${base}-s1`} className={sectionClass}>
          <h3 id={`${base}-s1`} className="text-base font-medium text-ti-50">1 · ข้อมูลเอกสารรับเข้า</h3>
          <fieldset className="space-y-1">
            <legend className="text-sm text-ti-400">แหล่งที่มา</legend>
            <div className="grid grid-cols-2 gap-1 rounded-panel border border-carbon-600 bg-carbon-900 p-1 sm:max-w-md">
              {(
                [
                  ["INVOICE", "ปั๊มนำเข้า (Invoice)"],
                  ["PO", "ผลิตเอง (PO 408/409)"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="relative">
                  <input type="radio" name="docType" value={value} checked={docType === value} onChange={() => changeDocType(value)} className="peer sr-only" />
                  <span className="flex h-10 cursor-pointer items-center justify-center rounded-control px-2 text-center text-sm text-ti-400 transition-colors peer-checked:bg-ember-500 peer-checked:font-semibold peer-checked:text-carbon-900 peer-focus-visible:ring-2 peer-focus-visible:ring-ember-400">
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Document fields: Invoice / PO */}
          {docType === "INVOICE" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label base={base} name="docNo" required>เลข Invoice</Label>
                <div className="relative">
                  <input
                    {...field("docNo")}
                    value={docNo}
                    onChange={(event) => {
                      setDocNo(event.target.value);
                      if (lookup) setLookup(null);
                    }}
                    onBlur={() => void check(docType, docNo)}
                    maxLength={64}
                    autoComplete="off"
                    placeholder="เช่น INV-2610-001"
                    className={`${inputClass} pr-10 ${docBorderClass}`}
                  />
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                    {checking ? (
                      <SpinnerIcon className="size-5" />
                    ) : isDocReady && result?.kind === "new" ? (
                      <CheckIcon className="size-5 text-emerald-400" />
                    ) : isDocReady && (result?.kind === "found" || result?.kind === "error") ? (
                      <XIcon className="size-5 text-red-400" />
                    ) : null}
                  </div>
                </div>
                {isDocReady && !checking && result?.kind === "new" && (
                  <span className="block text-xs font-medium text-emerald-400">✓ เลขนี้ยังไม่มีในระบบ (ไม่ซ้ำ)</span>
                )}
                {isDocReady && !checking && result?.kind === "found" && (
                  <span className="block text-xs font-medium text-red-400">
                    ✕ เลขนี้มีในระบบแล้ว (เปิดไปแล้ว {result.plans.length} แผน)
                  </span>
                )}
                {isDocReady && !checking && result?.kind === "error" && (
                  <span className="block text-xs font-medium text-red-400">✕ {result.message}</span>
                )}
                <ErrorText base={base} errors={errors} name="docNo" />
              </div>
              <div className="space-y-1">
                <Label base={base} name="invoiceDate" required>วันที่ Invoice</Label>
                {found ? (
                  <p className={`${inputClass} flex items-center text-ti-200`}>
                    {dateText(found.header.invoiceDate)}
                    <span className="ml-2 text-xs text-ti-500">(ใช้ตามหัวเอกสาร)</span>
                    <input type="hidden" name="invoiceDate" value={found.header.invoiceDate ?? ""} />
                  </p>
                ) : (
                  <input {...field("invoiceDate")} type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} className={inputClass} />
                )}
                <ErrorText base={base} errors={errors} name="invoiceDate" />
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <Label base={base} name="docNo" required>เลข PO</Label>
                <div className="relative">
                  <input
                    {...field("docNo")}
                    value={docNo}
                    onChange={(event) => {
                      setDocNo(event.target.value);
                      if (lookup) setLookup(null);
                    }}
                    onBlur={() => void check(docType, docNo)}
                    maxLength={64}
                    autoComplete="off"
                    placeholder="เช่น WO1274/69"
                    className={`${inputClass} pr-10 ${docBorderClass}`}
                  />
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                    {checking ? (
                      <SpinnerIcon className="size-5" />
                    ) : isDocReady && result?.kind === "new" ? (
                      <CheckIcon className="size-5 text-emerald-400" />
                    ) : isDocReady && (result?.kind === "found" || result?.kind === "error") ? (
                      <XIcon className="size-5 text-red-400" />
                    ) : null}
                  </div>
                </div>
                {isDocReady && !checking && result?.kind === "new" && (
                  <span className="block text-xs font-medium text-emerald-400">✓ เลขนี้ยังไม่มีในระบบ (ไม่ซ้ำ)</span>
                )}
                {isDocReady && !checking && result?.kind === "found" && (
                  <span className="block text-xs font-medium text-red-400">
                    ✕ เลขนี้มีในระบบแล้ว (เปิดไปแล้ว {result.plans.length} แผน)
                  </span>
                )}
                {isDocReady && !checking && result?.kind === "error" && (
                  <span className="block text-xs font-medium text-red-400">✕ {result.message}</span>
                )}
                <ErrorText base={base} errors={errors} name="docNo" />
              </div>
              <div className="space-y-1">
                <Label base={base} name="department" required>แผนก</Label>
                {found ? (
                  <p className={`${inputClass} flex items-center text-ti-200`}>
                    {found.header.department ?? "—"}
                    <span className="ml-2 text-xs text-ti-500">(ใช้ตามหัวเอกสาร)</span>
                    <input type="hidden" name="department" value={found.header.department ?? ""} />
                  </p>
                ) : (
                  <SearchSelect
                    {...field("department")}
                    value={department}
                    onChange={setDepartment}
                    className={inputClass}
                    options={[{ value: "", label: "— เลือก —" }, ...DEPARTMENTS.map((value) => ({ value, label: value }))]}
                  />
                )}
                <ErrorText base={base} errors={errors} name="department" />
              </div>
              <div className="space-y-1">
                <Label base={base} name="docDate">วันที่ PO</Label>
                {found ? (
                  <p className={`${inputClass} flex items-center text-ti-200`}>
                    {dateText(found.header.docDate)}
                    <span className="ml-2 text-xs text-ti-500">(ใช้ตามหัวเอกสาร)</span>
                    <input type="hidden" name="docDate" value={found.header.docDate ?? ""} />
                  </p>
                ) : (
                  <input {...field("docDate")} type="date" value={docDate} onChange={(event) => setDocDate(event.target.value)} className={inputClass} />
                )}
                <ErrorText base={base} errors={errors} name="docDate" />
              </div>
            </div>
          )}
        </section>

        <section aria-labelledby={`${base}-s2`} className={sectionClass}>
          <div className="flex items-center justify-between">
            <h3 id={`${base}-s2`} className="text-base font-medium text-ti-50">
              2 · เลือกรุ่นและงานตรวจ <span className="text-sm font-normal text-ti-400">(1 Model ต่อ 1 แผน)</span>
            </h3>
            {model && (
              <span className="rounded bg-ember-500/10 px-2.5 py-0.5 text-xs font-medium text-ember-300 border border-ember-500/30">
                {model.brandName}
              </span>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label base={base} name="modelId" required>รุ่นปั๊ม (Model)</Label>
              <SearchSelect
                {...field("modelId")}
                aria-invalid={errors.modelId || duplicate ? true : undefined}
                value={modelId}
                onChange={changeModel}
                className={inputClass}
                searchPlaceholder="พิมพ์รหัสรุ่น / คำอธิบาย / ยี่ห้อ…"
                options={[{ value: "", label: "— เลือกรุ่นปั๊ม —" }, ...models.map((item) => ({ value: String(item.id), label: `${item.code}${item.description ? ` · ${item.description}` : ""}`, keywords: item.brandName }))]}
              />
              {models.length === 0 && <span className="block text-xs text-ember-400">ยังไม่มี Model {docType === "INVOICE" ? "นำเข้า" : "ผลิตเอง"} ที่ใช้งานอยู่</span>}
              <ErrorText base={base} errors={errors} name="modelId" />
              {duplicate && (
                <p role="alert" className="text-xs text-ember-400">
                  แผนนี้เปิดแล้ว: <span className="font-mono font-semibold">{duplicate.planNo}</span> ({normalizeDocNo(docNo)} + {duplicate.modelCode}) — เลือก Model อื่น ·{" "}
                  <Link href={`/plans/${duplicate.id}`} className="underline underline-offset-4 hover:text-ember-500">ไปที่แผนเดิม</Link>
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label base={base} name="vendorId" required>{docType === "INVOICE" ? "Vendor / ผู้ผลิต" : "ผู้ผลิต (โรงงาน)"}</Label>
              {found ? (
                // The document already exists: its vendor is shared by all its plans and is changed on the plan page.
                <p id={`${base}-vendorId`} className={`${inputClass} flex items-center text-ti-200`}>
                  {found.vendorName ?? "ยังไม่ระบุ"}
                  <span className="ml-2 text-xs text-ti-500">(ใช้ตามหัวเอกสาร)</span>
                </p>
              ) : (
                <SearchSelect
                  {...field("vendorId")}
                  value={vendorId}
                  onChange={setVendorId}
                  className={inputClass}
                  options={[{ value: "", label: "— เลือก Vendor —" }, ...options.vendors.map((vendor) => ({ value: String(vendor.id), label: vendor.name }))]}
                />
              )}
              <span className="block text-xs text-ti-500">
                {found ? "Vendor ของเอกสารนี้ — แก้ได้ที่หน้ารายละเอียดแผน" : "เลือกรุ่นแล้วระบบจะดึง Vendor มาให้ทันที (เปลี่ยนเองได้)"}
              </span>
              <ErrorText base={base} errors={errors} name="vendorId" />
            </div>
          </div>

          <dl className="grid gap-x-4 gap-y-2 rounded-control border border-carbon-700 bg-carbon-900/60 p-3 text-sm sm:grid-cols-3">
            <Info term="Brand" value={model?.brandName ?? "—"} />
            <Info term="ประเภทปั๊ม" value={model?.pumpType ?? "—"} />
            <Info term="Checklist QC / QA" value={model ? `${model.qcChecklist ?? "ยังไม่ผูก"} / ${model.qaChecklist ?? "ยังไม่ผูก"}` : "—"} />
          </dl>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label base={base} name="lotQty" required>จำนวนตาม {docType === "INVOICE" ? "Invoice" : "PO"} (ล็อต)</Label>
              <input {...field("lotQty")} value={lotQty} onChange={(event) => setLotQty(event.target.value)} inputMode="numeric" placeholder="เช่น 350" className={inputClass} />
              <ErrorText base={base} errors={errors} name="lotQty" />
            </div>
            <div className="space-y-1">
              <Label base={base} name="receiptDate">วันที่รับสินค้าเข้า</Label>
              <input {...field("receiptDate")} type="date" defaultValue={echoed.receiptDate ?? ""} className={inputClass} />
              <ErrorText base={base} errors={errors} name="receiptDate" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Label base={base} name="description">Description</Label>
              <input {...field("description")} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={400} placeholder="ดึงจาก Model — แก้ได้" className={inputClass} />
              <ErrorText base={base} errors={errors} name="description" />
            </div>
            <div className="space-y-1">
              <Label base={base} name="manufacturer">ผู้ผลิต (โรงงาน)</Label>
              <input {...field("manufacturer")} defaultValue={echoed.manufacturer ?? ""} maxLength={200} placeholder="ไม่บังคับ" className={inputClass} />
              <ErrorText base={base} errors={errors} name="manufacturer" />
            </div>
            <div className="space-y-1">
              <Label base={base} name="remarks">หมายเหตุ</Label>
              <input {...field("remarks")} defaultValue={echoed.remarks ?? ""} maxLength={1000} placeholder="ไม่บังคับ" className={inputClass} />
              <ErrorText base={base} errors={errors} name="remarks" />
            </div>
          </div>
        </section>
      </div>

      {/* Always in view while filling in: above the tab bar on mobile, below the sticky 56px top bar (+50px gap) on laptop. */}
      <aside
        aria-label="สรุปแผน"
        className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 space-y-2 app-panel rounded-panel border border-pass/60 bg-[color-mix(in_srgb,var(--color-pass)_12%,var(--color-carbon-800))] p-3 shadow-lg lg:space-y-3 lg:p-4 shadow-black/30 backdrop-blur md:bottom-4 lg:top-[calc(4.5rem+50px)] lg:bottom-auto"
      >
        <div className="flex items-end justify-between gap-3 lg:block lg:space-y-4">
          <div aria-live="polite">
            <p className="text-xs text-ti-400">QC ต้องตรวจ</p>
            <p className="font-mono text-3xl leading-tight text-ti-50 lg:text-4xl">{qc ?? "–"}</p>
            <p className="hidden text-xs text-ti-500 lg:block">{lot ? `ปัดขึ้น(${lot.toLocaleString("th-TH")} × ${settings.qcPercent}%) = ${qc}` : "กรอกจำนวนล็อตก่อน"}</p>
          </div>
          <div className="text-right lg:border-t lg:border-carbon-700 lg:pt-3 lg:text-left">
            <p className="text-xs text-ti-400">กำหนดตรวจ {settings.deadlineDays} วัน</p>
            {docType === "PO" ? (
              <p className="text-sm text-ti-500">ไม่ใช้กับปั๊มผลิตเอง</p>
            ) : deadline && left !== null ? (
              <p className={`text-sm ${left < 0 ? "text-red-300" : left <= 14 ? "text-ember-400" : "text-ti-200"}`}>
                {dateText(deadline)} · {left < 0 ? `เลยกำหนด ${-left} วัน` : `เหลือ ${left} วัน`}
              </p>
            ) : (
              <p className="text-sm text-ti-500">รอวันที่ Invoice</p>
            )}
          </div>
        </div>
        <dl className="hidden space-y-2 border-t border-carbon-700 pt-3 text-xs lg:block">
          <Info term="เลขที่แผน" value="ออกอัตโนมัติเมื่อบันทึก (QP-YYMM-NNNN)" />
          <Info term="QA (AQL)" value="R1.1 — ยังไม่ใช้ใน Pilot" />
        </dl>
        <button type="submit" disabled={blocked} className="h-11 w-full rounded-control app-primary-action bg-ember-500 lg:h-12 px-5 text-sm font-semibold text-carbon-900 transition-colors hover:bg-ember-400 disabled:cursor-not-allowed disabled:opacity-50">
          {pending ? "กำลังบันทึก…" : "บันทึกแผน"}
        </button>
        <p className="text-xs text-ti-500" aria-live="polite">
          {duplicate ? "Model นี้มีแผนแล้วในเอกสารนี้" : missing.length > 0 ? `ยังขาด: ${missing.join(", ")}` : "✓ พร้อมบันทึก"}
        </p>
      </aside>
    </form>
  );
}

type FieldName = keyof OpenPlanFormValues;

function Label({ base, name, children, required }: { base: string; name: FieldName; children: React.ReactNode; required?: boolean }) {
  return (
    <label htmlFor={`${base}-${name}`} className="block text-sm text-ti-400">
      {children}
      {required && <span aria-hidden="true"> *</span>}
    </label>
  );
}

function ErrorText({ base, errors, name }: { base: string; errors: Partial<Record<FieldName, string>>; name: FieldName }) {
  return errors[name] ? <span id={`${base}-${name}-e`} className="block text-xs text-red-300">{errors[name]}</span> : null;
}

function Info({ term, value }: { term: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ti-500">{term}</dt>
      <dd className="break-words text-ti-200">{value}</dd>
    </div>
  );
}

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
    </svg>
  );
}

function XIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
    </svg>
  );
}

function SpinnerIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className="animate-spin text-ti-400" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
