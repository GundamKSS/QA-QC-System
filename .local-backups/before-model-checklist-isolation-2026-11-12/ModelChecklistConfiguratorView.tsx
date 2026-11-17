"use client";

import { SearchSelect } from "@/components/ui/SearchSelect";
import { AppBack } from "@/components/ui/AppBack";
import { useState } from "react";
import { CardsSkeleton } from "@/components/feedback/CardsSkeleton";
import { LoadError } from "@/components/feedback/LoadError";
import { StepMinimalAnimation } from "@/components/inspections/StepMinimalAnimation";
import { invalidateApiReads } from "@/lib/api/invalidate";
import { ANIMATION_TYPE_LABELS, inferItemAnimationType } from "@/lib/inspections/rules";
import {
  ANIMATION_TYPES,
  type AnimationType,
  type InputType,
  type InspectionRole,
  type PhotoRule,
  type VideoRule,
} from "@/lib/inspections/types";
import type {
  ModelChecklistItemInput,
  ModelChecklistPayload,
} from "@/lib/master/model-checklist-types";
import { useModelChecklists } from "./useModelChecklists";

type Props = {
  canEdit: boolean;
  initialModelId?: number;
  initialRole?: InspectionRole;
};

const INPUT_TYPE_OPTIONS: { value: InputType; label: string }[] = [
  { value: "PASS_FAIL", label: "ปกติ / พบปัญหา (Pass/Fail)" },
  { value: "NUMBER", label: "กรอกค่าตัวเลข (เช่น แรงดัน Bar / กระแส Amp)" },
  { value: "TEXT", label: "กรอกข้อความ / หมายเหตุ" },
];

const PHOTO_RULE_OPTIONS: { value: PhotoRule; label: string }[] = [
  { value: "ON_FAIL", label: "บังคับถ่ายเมื่อพบปัญหา (On Fail)" },
  { value: "ALWAYS", label: "บังคับถ่ายรูปทุกครั้ง (Always)" },
  { value: "NONE", label: "ถ่ายประกอบได้ ไม่บังคับ (Optional)" },
];

const VIDEO_RULE_OPTIONS: { value: VideoRule; label: string }[] = [
  { value: "NONE", label: "ไม่บังคับวิดีโอ" },
  { value: "ON_FAIL", label: "บังคับวิดีโอเมื่อพบปัญหา" },
  { value: "ALWAYS", label: "บังคับวิดีโอทุกครั้ง" },
];

export function ModelChecklistConfiguratorView({
  canEdit,
  initialModelId,
  initialRole = "QC",
}: Props) {
  const [selectedModelId, setSelectedModelId] = useState<number | undefined>(initialModelId);
  const [role, setRole] = useState<InspectionRole>(initialRole);

  const { data, loading, error, reload } = useModelChecklists(selectedModelId, role);

  return (
    <div className="min-w-0 w-full space-y-6 p-4 sm:p-6 max-w-6xl mx-auto">
      <AppBack href="/master">กลับไปข้อมูลหลัก</AppBack>
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold text-ti-50">
            จัดการเช็คลิสต์ผูกกับโมเดล (Model Checklist Builder)
          </h1>
          <p className="text-xs sm:text-sm text-ti-400">
            กำหนดขั้นตอนการตรวจ (1-2-3-4-5-6) เฉพาะแต่ละโมเดล เพิ่ม/ลดขั้นตอน เลือกอนิเมชั่นมินิมอล และเผยแพร่เวอร์ชันใหม่โดยไม่กระทบประวัติผลตรวจเก่า
          </p>
        </div>

        {/* Role Selector (QC / QA) */}
        <div className="inline-flex rounded-control border border-carbon-600 bg-carbon-800 p-1">
          {(["QC", "QA"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={`rounded px-4 py-1.5 text-xs font-semibold transition-colors ${
                role === r
                  ? "bg-ember-500 text-carbon-900"
                  : "text-ti-300 hover:text-ti-100"
              }`}
            >
              เช็คลิสต์ฝั่ง {r}
            </button>
          ))}
        </div>
      </header>

      {error && <LoadError message={error} onRetry={reload} />}

      {!data ? (
        !error && <CardsSkeleton label="กำลังโหลดข้อมูลเช็คลิสต์รายรุ่น" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left Column: Model Selector List */}
          <aside className="lg:col-span-4 space-y-3">
            <div className="rounded-panel border border-carbon-700 bg-carbon-800 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ti-100">
                  เลือกโมเดลปั๊มลม ({data.models.length} รุ่น)
                </h2>
                <span className="text-[11px] font-mono text-ti-400">ฝั่ง {data.role}</span>
              </div>

              <ul className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {data.models.map((m) => {
                  const isSelected = m.modelId === data.selectedModelId;
                  return (
                    <li key={m.modelId}>
                      <button
                        type="button"
                        onClick={() => setSelectedModelId(m.modelId)}
                        className={`w-full text-left rounded-control border p-3 transition-all ${
                          isSelected
                            ? "border-ember-500 bg-ember-500/15 ring-1 ring-ember-500/40"
                            : "border-carbon-700 bg-carbon-900/70 hover:border-carbon-500"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-sm font-bold text-ti-50">
                            {m.modelCode}
                          </span>
                          <span className="rounded-full bg-carbon-700 px-2 py-0.5 font-mono text-[10px] text-ember-300">
                            v{m.versionNo} · {m.itemCount} ขั้นตอน
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-ti-300 line-clamp-1">
                          {m.modelDescription ?? m.brandName}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-ti-400">
                          <span>ยี่ห้อ: {m.brandName}</span>
                          {m.pumpTypeName && <span>· {m.pumpTypeName}</span>}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Architecture Note Box */}
            <div className="rounded-panel border border-carbon-700 bg-carbon-800/60 p-4 space-y-2 text-xs text-ti-300">
              <h3 className="font-semibold text-ti-100">
                💡 การจัดเก็บข้อมูลและนำไปใช้ต่อ
              </h3>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-ti-400 leading-relaxed">
                <li>แต่ละโมเดลกำหนดจำนวนขั้นตอนมาก-น้อยได้อิสระตามสเปกจริง</li>
                <li>ทุกครั้งที่กดบันทึก ระบบจะออกเลข <strong className="text-ti-200">Version ใหม่ (v1 → v2)</strong></li>
                <li>เครื่องที่ตรวจไปแล้วในอดีตจะผูกกับ Version เดิม ข้อมูลเก่าจึงไม่เพี้ยน 100%</li>
                <li>ผลตรวจรายข้อถูกเก็บลงตาราง <code className="text-ti-200">item_results</code> นำไปออกรายงาน QC และวิเคราะห์ Defect รายรุ่นได้ทันที</li>
              </ul>
            </div>
          </aside>

          {/* Right Column: Checklist Steps Builder for Selected Model */}
          <div className="lg:col-span-8">
            <ModelChecklistEditor
              key={`${data.selectedModelId}-${data.role}-${data.activeVersionNo}`}
              data={data}
              canEdit={canEdit}
              loading={loading}
              onSaved={reload}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ModelChecklistEditor({
  data,
  canEdit,
  loading,
  onSaved,
}: {
  data: ModelChecklistPayload;
  canEdit: boolean;
  loading: boolean;
  onSaved: () => void;
}) {
  const currentModel =
    data.models.find((m) => m.modelId === data.selectedModelId) ?? data.models[0];

  const [items, setItems] = useState<ModelChecklistItemInput[]>(() =>
    data.items.map((it) => ({
      topicCode: it.topicCode ?? `CHK-${String(it.seq).padStart(2, "0")}`,
      title: it.title,
      inputType: it.inputType,
      isRequired: it.isRequired,
      photoRule:
        it.photoRule === "ALWAYS" || it.photoRule === "NONE" ? it.photoRule : "ON_FAIL",
      videoRule: it.videoRule,
      animationType: inferItemAnimationType(it),
      helpText: it.helpText ?? null,
    })),
  );

  const [previewStepIdx, setPreviewStepIdx] = useState<number | null>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveBanner, setSaveBanner] = useState<{
    tone: "pass" | "fail";
    message: string;
  } | null>(null);

  function handleUpdateItem(index: number, patch: Partial<ModelChecklistItemInput>) {
    setItems((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)),
    );
    setSaveBanner(null);
  }

  function handleMoveItem(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    setItems((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      copy.splice(target, 0, moved);
      return copy;
    });
    setPreviewStepIdx(target);
    setSaveBanner(null);
  }

  function handleRemoveItem(index: number) {
    if (items.length <= 1) {
      setSaveBanner({
        tone: "fail",
        message: "ต้องมีหัวข้อเช็คลิสต์อย่างน้อย 1 ขั้นตอนในโมเดลนี้",
      });
      return;
    }
    setItems((prev) => prev.filter((_, idx) => idx !== index));
    setPreviewStepIdx(null);
    setSaveBanner(null);
  }

  function handleAddFromMasterPool(poolItem: ModelChecklistItemInput) {
    setItems((prev) => [
      ...prev,
      {
        ...poolItem,
        topicCode: `CHK-${String(prev.length + 1).padStart(2, "0")}`,
      },
    ]);
    setPreviewStepIdx(items.length);
    setSaveBanner(null);
  }

  function handleAddCustomBlankItem() {
    setItems((prev) => [
      ...prev,
      {
        topicCode: `CHK-${String(prev.length + 1).padStart(2, "0")}`,
        title: "",
        inputType: "PASS_FAIL",
        isRequired: true,
        photoRule: "ON_FAIL",
        videoRule: "NONE",
        animationType: "GENERAL_CHECK",
        helpText: "",
      },
    ]);
    setPreviewStepIdx(items.length);
    setSaveBanner(null);
  }

  async function handlePublishVersion() {
    setIsSaving(true);
    setSaveBanner(null);

    try {
      const res = await fetch("/api/master/model-checklists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: data.selectedModelId,
          role: data.role,
          items,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        status?: string;
        message?: string;
      };

      if (res.ok && json.status === "done") {
        setSaveBanner({
          tone: "pass",
          message:
            json.message ??
            "บันทึกและเผยแพร่เช็คลิสต์เวอร์ชันใหม่เรียบร้อยแล้ว",
        });
        invalidateApiReads();
        onSaved();
      } else {
        setSaveBanner({
          tone: "fail",
          message: json.message ?? "ไม่สามารถบันทึกเช็คลิสต์ได้ กรุณาตรวจสอบข้อมูล",
        });
      }
    } catch {
      setSaveBanner({
        tone: "fail",
        message: "เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-5" aria-busy={loading || isSaving}>
      {/* Active Model Banner */}
      <div className="rounded-panel border border-carbon-700 bg-carbon-800 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="rounded bg-ember-500/20 border border-ember-500/40 px-2 py-0.5 font-mono text-xs font-bold text-ember-300">
              {currentModel?.modelCode}
            </span>
            <span className="rounded bg-carbon-700 px-2 py-0.5 font-mono text-xs text-ti-200">
              เวอร์ชันปัจจุบัน v{data.activeVersionNo}
            </span>
            <span className="rounded bg-pass/15 border border-pass/30 px-2 py-0.5 font-mono text-xs text-pass">
              {items.length} ขั้นตอน
            </span>
          </div>
          <h2 className="text-base font-semibold text-ti-50">
            {currentModel?.modelDescription ?? currentModel?.modelCode}
          </h2>
        </div>

        {canEdit && (
          <button
            type="button"
            disabled={isSaving}
            onClick={handlePublishVersion}
            className="h-11 rounded-control app-primary-action bg-ember-500 hover:bg-ember-400 px-5 text-xs sm:text-sm font-semibold text-carbon-900 shadow-sm disabled:opacity-50"
          >
            {isSaving
              ? "กำลังเผยแพร่เวอร์ชันใหม่..."
              : `บันทึกและเผยแพร่เป็น v${data.activeVersionNo + 1}`}
          </button>
        )}
      </div>

      {/* Feedback Banner */}
      {saveBanner && (
        <div
          role="alert"
          className={`rounded-control border p-3.5 text-xs font-medium ${
            saveBanner.tone === "pass"
              ? "border-pass/60 bg-pass/10 text-pass"
              : "border-fail/60 bg-fail/10 text-fail"
          }`}
        >
          {saveBanner.message}
        </div>
      )}

      {/* Step-by-Step Items List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ti-100">
            ลำดับขั้นตอนการตรวจบนมือถือ (1 → {items.length} ห้ามข้ามขั้นตอน)
          </h3>
          {canEdit && (
            <button
              type="button"
              onClick={handleAddCustomBlankItem}
              className="rounded-control border border-ember-500/60 bg-ember-950/30 px-3 py-1.5 text-xs font-semibold text-ember-300 hover:bg-ember-950/50"
            >
              + สร้างขั้นตอนใหม่เอง
            </button>
          )}
        </div>

        {items.map((item, idx) => {
          const isPreviewOpen = previewStepIdx === idx;
          return (
            <div
              key={idx}
              className="rounded-panel border border-carbon-700 bg-carbon-800 p-4 space-y-3 transition-colors hover:border-carbon-600"
            >
              {/* Step Row Header */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 min-w-8 items-center justify-center rounded bg-ember-500/20 border border-ember-500/40 px-2 font-mono text-xs font-bold text-ember-300">
                    ขั้นตอนที่ {idx + 1}
                  </span>
                  <span className="font-mono text-xs text-ti-400">
                    {ANIMATION_TYPE_LABELS[item.animationType]}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPreviewStepIdx(isPreviewOpen ? null : idx)}
                    className="rounded border border-carbon-600 bg-carbon-900 px-2.5 py-1 text-[11px] text-ti-200 hover:border-ember-400"
                  >
                    {isPreviewOpen ? "ซ่อนพรีวิวอนิเมชั่น" : "▶ ดูอนิเมชั่น"}
                  </button>

                  {canEdit && (
                    <>
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveItem(idx, -1)}
                        className="size-7 rounded border border-carbon-600 bg-carbon-900 text-xs text-ti-300 hover:text-ti-50 disabled:opacity-30"
                        title="เลื่อนขึ้น"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        disabled={idx === items.length - 1}
                        onClick={() => handleMoveItem(idx, 1)}
                        className="size-7 rounded border border-carbon-600 bg-carbon-900 text-xs text-ti-300 hover:text-ti-50 disabled:opacity-30"
                        title="เลื่อนลง"
                      >
                        ▼
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="size-7 rounded border border-fail/40 bg-fail/10 text-xs text-fail hover:bg-fail hover:text-white"
                        title="ลบขั้นตอนนี้"
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Live Minimal Animation Preview */}
              {isPreviewOpen && (
                <StepMinimalAnimation
                  item={{
                    id: idx + 1,
                    seq: idx + 1,
                    topicCode: item.topicCode,
                    title: item.title || `ขั้นตอนที่ ${idx + 1}`,
                    inputType: item.inputType,
                    isRequired: item.isRequired,
                    photoRule: item.photoRule,
                    videoRule: item.videoRule,
                    animationType: item.animationType,
                    helpText: item.helpText,
                  }}
                  status={null}
                  totalSteps={items.length}
                />
              )}

              {/* Editable Fields */}
              <div className="grid gap-3 sm:grid-cols-12">
                <div className="sm:col-span-8 space-y-1">
                  <label className="block text-[11px] text-ti-400">
                    ชื่อหัวข้อตรวจ (แสดงในขั้นตอนที่ {idx + 1}) *
                  </label>
                  <input
                    type="text"
                    disabled={!canEdit}
                    value={item.title}
                    onChange={(e) => handleUpdateItem(idx, { title: e.target.value })}
                    placeholder="เช่น ตรวจสอบสภาพภายนอก ถังลม และสีเคลือบผิว"
                    className="h-10 w-full rounded-control border border-carbon-600 bg-carbon-900 px-3 text-xs sm:text-sm text-ti-50 focus:outline-none focus:ring-1 focus:ring-ember-500 disabled:opacity-60"
                  />
                </div>

                <div className="sm:col-span-4 space-y-1">
                  <label className="block text-[11px] text-ti-400">
                    อนิเมชั่นมินิมอลประจำขั้นตอน
                  </label>
                  <SearchSelect
                    disabled={!canEdit}
                    value={item.animationType}
                    onChange={(v) => handleUpdateItem(idx, { animationType: v as AnimationType })}
                    className="h-10 w-full rounded-control border border-carbon-600 bg-carbon-900 px-2.5 text-xs text-ti-100 focus:outline-none focus:ring-1 focus:ring-ember-500 disabled:opacity-60"
                    options={ANIMATION_TYPES.map((type) => ({ value: type, label: ANIMATION_TYPE_LABELS[type] }))}
                  />
                </div>

                <div className="sm:col-span-4 space-y-1">
                  <label className="block text-[11px] text-ti-400">รูปแบบการตอบผล</label>
                  <SearchSelect
                    disabled={!canEdit}
                    value={item.inputType}
                    onChange={(v) => handleUpdateItem(idx, { inputType: v as InputType })}
                    className="h-9 w-full rounded-control border border-carbon-600 bg-carbon-900 px-2.5 text-xs text-ti-100"
                    options={INPUT_TYPE_OPTIONS}
                  />
                </div>

                <div className="sm:col-span-4 space-y-1">
                  <label className="block text-[11px] text-ti-400">กติกาถ่ายรูป</label>
                  <SearchSelect
                    disabled={!canEdit}
                    value={item.photoRule}
                    onChange={(v) => handleUpdateItem(idx, { photoRule: v as PhotoRule })}
                    className="h-9 w-full rounded-control border border-carbon-600 bg-carbon-900 px-2.5 text-xs text-ti-100"
                    options={PHOTO_RULE_OPTIONS}
                  />
                </div>

                <div className="sm:col-span-4 space-y-1">
                  <label className="block text-[11px] text-ti-400">กติกาถ่ายวิดีโอ</label>
                  <SearchSelect
                    disabled={!canEdit}
                    value={item.videoRule}
                    onChange={(v) => handleUpdateItem(idx, { videoRule: v as VideoRule })}
                    className="h-9 w-full rounded-control border border-carbon-600 bg-carbon-900 px-2.5 text-xs text-ti-100"
                    options={VIDEO_RULE_OPTIONS}
                  />
                </div>

                <div className="sm:col-span-12 space-y-1">
                  <input
                    type="text"
                    disabled={!canEdit}
                    value={item.helpText ?? ""}
                    onChange={(e) =>
                      handleUpdateItem(idx, { helpText: e.target.value })
                    }
                    placeholder="คำแนะนำวิธีตรวจสำหรับขั้นตอนนี้ (เช่น ตรวจดูรอยถลอก รอยเชื่อม หรือระดับน้ำมันกึ่งกลางตาแมว)"
                    className="h-9 w-full rounded-control border border-carbon-700 bg-carbon-900/60 px-3 text-xs text-ti-200 placeholder:text-ti-500"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Common Master Checklist Pool Picker */}
      {canEdit && (
        <section className="rounded-panel border border-carbon-700 bg-carbon-800/80 p-4 sm:p-5 space-y-3">
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold text-ti-50">
              คลังหัวข้อตรวจมาตรฐานกลาง (Common Master Pool)
            </h3>
            <p className="text-xs text-ti-400">
              แตะปุ่ม <strong className="text-ember-300">+ เพิ่มเข้าโมเดลนี้</strong> เพื่อดึงหัวข้อมาตรฐานเข้าไปต่อท้ายเช็คลิสต์ของรุ่น {currentModel?.modelCode} ได้ทันที
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {data.masterPool.map((poolItem, idx) => {
              const alreadyInList = items.some((it) => it.title === poolItem.title);
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-3 rounded-control border border-carbon-700 bg-carbon-900/70 p-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <span className="block text-xs font-medium text-ti-100 truncate">
                      {poolItem.title}
                    </span>
                    <span className="block text-[10px] font-mono text-ti-400">
                      {ANIMATION_TYPE_LABELS[poolItem.animationType]} · {poolItem.inputType}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddFromMasterPool(poolItem)}
                    className={`shrink-0 rounded-control border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                      alreadyInList
                        ? "border-carbon-600 bg-carbon-800 text-ti-300 hover:border-ember-400"
                        : "border-ember-500/60 bg-ember-500/20 text-ember-300 hover:bg-ember-500 hover:text-carbon-900"
                    }`}
                  >
                    {alreadyInList ? "+ เพิ่มซ้ำ" : "+ เพิ่มเข้าโมเดลนี้"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
