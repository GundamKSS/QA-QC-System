"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CardsSkeleton } from "@/components/feedback/CardsSkeleton";
import { LoadError } from "@/components/feedback/LoadError";
import { StepMinimalAnimation } from "@/components/inspections/StepMinimalAnimation";
import { AppBack } from "@/components/ui/AppBack";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { useApiRead } from "@/lib/api/client";
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
  ChecklistTemplateSummary,
  ModelChecklistHistoryPayload,
  ModelChecklistItemInput,
  ModelChecklistPayload,
} from "@/lib/master/model-checklist-types";
import { useModelChecklists } from "./useModelChecklists";

type Props = {
  canEdit: boolean;
  initialTemplateId?: number;
  initialModelId?: number;
  initialRole?: InspectionRole;
  onBack?: () => void;
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
  initialTemplateId,
  initialModelId,
  initialRole = "QC",
  onBack,
}: Props) {
  const { data, loading, error, reload } = useModelChecklists(
    initialTemplateId,
    initialRole,
    initialModelId,
  );

  return (
    <div className="min-w-0 w-full space-y-6 p-4 sm:p-6 lg:p-8 2xl:p-10 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="app-back-btn master-back"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m12 5-7 7 7 7M5 12h14" />
            </svg>
            <span>กลับไปเทมเพลตเช็คลิสต์</span>
          </button>
        ) : (
          <AppBack href="/master/checklist-templates">
            กลับไปเทมเพลตเช็คลิสต์
          </AppBack>
        )}
        <Link
          href="/master/models"
          className="inline-flex h-9 items-center gap-1.5 rounded-control border border-carbon-600 bg-carbon-800 px-3.5 text-xs font-semibold text-ti-100 hover:border-ember-500/60 hover:text-ember-300 transition-colors"
        >
          <span>ไปหน้ารุ่นปั๊ม (Master Model) เพื่อเลือก Template</span>
          <span>→</span>
        </Link>
      </div>

      {error && <LoadError message={error} onRetry={reload} />}

      {!data ? (
        !error && <CardsSkeleton label="กำลังโหลดข้อมูลการจัดลำดับเช็คลิสต์ของ Template" />
      ) : (
        <TemplateChecklistEditor
          key={`tpl-${data.selectedTemplateId}-${data.role}-${data.activeVersionNo}`}
          data={data}
          canEdit={canEdit}
          loading={loading}
          onSaved={() => {
            reload();
          }}
        />
      )}
    </div>
  );
}

function TemplateChecklistEditor({
  data,
  canEdit,
  loading,
  onSaved,
}: {
  data: ModelChecklistPayload;
  canEdit: boolean;
  loading: boolean;
  onSaved: (savedTemplateId?: number) => void;
}) {
  const currentTemplate: ChecklistTemplateSummary | undefined =
    data.templates.find((t) => t.templateId === data.selectedTemplateId) ??
    data.templates[0];

  const [activeMainTab, setActiveMainTab] = useState<"steps" | "history">("steps");

  const [templateCode, setTemplateCode] = useState<string>(
    () => currentTemplate?.templateCode ?? `TPL-${data.role}-01`,
  );
  const [templateName, setTemplateName] = useState<string>(
    () => currentTemplate?.templateName ?? "",
  );
  const [scope, setScope] = useState<string>(
    () => currentTemplate?.scope ?? "",
  );

  const [items, setItems] = useState<ModelChecklistItemInput[]>(() => {
    const sourceItems: ModelChecklistItemInput[] =
      data.items.length > 0
        ? data.items.map((it): ModelChecklistItemInput => ({
            topicCode: it.topicCode ?? `CHK-${String(it.seq).padStart(2, "0")}`,
            title: it.title,
            inputType: it.inputType,
            isRequired: it.isRequired,
            photoRule:
              it.photoRule === "ALWAYS" || it.photoRule === "NONE"
                ? it.photoRule
                : "ON_FAIL",
            videoRule: it.videoRule,
            animationType: inferItemAnimationType(it),
            helpText: it.helpText ?? null,
          }))
        : data.masterPool.slice(0, 5);
    return sourceItems.map((it, i) => ({
      ...it,
      topicCode: it.topicCode ?? `CHK-${String(i + 1).padStart(2, "0")}`,
    }));
  });

  const [quickModelId, setQuickModelId] = useState<string>("");
  const [isAssigningModel, setIsAssigningModel] = useState(false);

  const [previewStepIdx, setPreviewStepIdx] = useState<number | null>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
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
        message: "ต้องมีหัวข้อเช็คลิสต์อย่างน้อย 1 ขั้นตอนใน Template นี้",
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
          isNewTemplate: false,
          templateId: currentTemplate?.templateId,
          templateCode: templateCode.trim(),
          templateName: templateName.trim(),
          scope: scope.trim() || null,
          role: data.role,
          items,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        status?: string;
        message?: string;
        templateId?: number;
      };

      if (res.ok && json.status === "done") {
        setSaveBanner({
          tone: "pass",
          message:
            json.message ??
            "บันทึกและเผยแพร่เทมเพลตเช็คลิสต์เรียบร้อยแล้ว",
        });
        invalidateApiReads();
        onSaved(json.templateId);
      } else {
        setSaveBanner({
          tone: "fail",
          message: json.message ?? "ไม่สามารถบันทึกเทมเพลตเช็คลิสต์ได้ กรุณาตรวจสอบข้อมูล",
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

  async function handleAssignModelToTemplate(targetModelId: number, assignTplId: number | null) {
    setIsAssigningModel(true);
    setSaveBanner(null);
    try {
      const res = await fetch("/api/master/model-checklists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assign_model_template",
          modelId: targetModelId,
          role: data.role,
          templateId: assignTplId,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        status?: string;
        message?: string;
      };
      if (res.ok && json.status === "done") {
        setSaveBanner({
          tone: "pass",
          message: json.message ?? "อัปเดตการผูก Template กับรุ่นปั๊มเรียบร้อยแล้ว",
        });
        setQuickModelId("");
        invalidateApiReads();
        onSaved(currentTemplate?.templateId);
      } else {
        setSaveBanner({
          tone: "fail",
          message: json.message ?? "ไม่สามารถผูก Template กับรุ่นปั๊มได้",
        });
      }
    } catch {
      setSaveBanner({
        tone: "fail",
        message: "เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์",
      });
    } finally {
      setIsAssigningModel(false);
    }
  }

  const unlinkedModels = useMemo(() => {
    if (!currentTemplate) return data.models;
    const linkedIds = new Set(currentTemplate.linkedModels.map((m) => m.modelId));
    return data.models.filter((m) => !linkedIds.has(m.modelId));
  }, [data.models, currentTemplate]);

  return (
    <div className="space-y-5" aria-busy={loading || isSaving || isAssigningModel}>
      {/* Active Template Header & 2 Tab Icon Buttons */}
      <div className="rounded-panel border border-carbon-700 bg-carbon-800 p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-ember-500/20 border border-ember-500/40 px-2.5 py-0.5 font-mono text-xs sm:text-sm font-bold text-ember-300">
                {currentTemplate?.templateCode ?? templateCode}
              </span>
              <span className="rounded bg-carbon-700 px-2 py-0.5 text-xs font-semibold text-ti-200">
                ฝั่ง {data.role}
              </span>
              <span className="rounded bg-carbon-700 px-2 py-0.5 font-mono text-xs text-ti-200">
                เวอร์ชันปัจจุบัน v{data.activeVersionNo}
              </span>
              <button
                type="button"
                onClick={() => setActiveMainTab("history")}
                className="text-[11px] text-ember-400 hover:text-ember-300 underline font-medium cursor-pointer"
                title="กดเพื่อดูประวัติและเลือกสลับกลับไปใช้เวอร์ชันเดิม"
              >
                (สลับเวอร์ชันอื่น)
              </button>
              <span className="rounded bg-pass/15 border border-pass/30 px-2 py-0.5 font-mono text-xs text-pass">
                {items.length} ขั้นตอน
              </span>
              {currentTemplate?.updatedAt && (
                <span className="text-xs text-ti-400 flex items-center gap-1">
                  <span>· ปรับปรุงล่าสุด:</span>
                  <span className="font-mono text-ti-200">
                    {new Date(currentTemplate.updatedAt).toLocaleString("th-TH", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    น.
                  </span>
                </span>
              )}
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-ti-50">
              {currentTemplate?.templateName || templateName}
            </h1>
            <p className="text-xs text-ti-400">
              จัดลำดับขั้นตอนการตรวจเช็คลิสต์ เพิ่ม ลบ แก้ไข และดูประวัติเวอร์ชันของรหัส{" "}
              <strong className="font-mono text-ti-200">
                {currentTemplate?.templateCode ?? templateCode}
              </strong>
            </p>
          </div>

          {/* 2 Tab Icon Buttons (Steps Ordering vs Version History) */}
          <div
            role="tablist"
            aria-label="สลับมุมมองการจัดลำดับเช็คลิสต์และประวัติเวอร์ชัน"
            className="inline-flex items-center gap-1.5 rounded-control border border-carbon-600 bg-carbon-900 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeMainTab === "steps"}
              onClick={() => setActiveMainTab("steps")}
              title="จัดลำดับเช็คลิสต์ (เพิ่ม / ลบ / แก้ไข / เรียงลำดับ)"
              className={`inline-flex h-9 items-center gap-2 rounded px-3 text-xs font-semibold transition-all ${
                activeMainTab === "steps"
                  ? "bg-ember-500 text-carbon-900 shadow-sm"
                  : "text-ti-300 hover:bg-carbon-800 hover:text-ti-100"
              }`}
            >
              <svg
                className="w-4 h-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                />
              </svg>
              <span>จัดลำดับเช็คลิสต์</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeMainTab === "history"}
              onClick={() => setActiveMainTab("history")}
              title="ดูประวัติเวอร์ชันและบันทึกการแก้ไข (Version History & Audit)"
              className={`inline-flex h-9 items-center gap-2 rounded px-3 text-xs font-semibold transition-all ${
                activeMainTab === "history"
                  ? "bg-ember-500 text-carbon-900 shadow-sm"
                  : "text-ti-300 hover:bg-carbon-800 hover:text-ti-100"
              }`}
            >
              <svg
                className="w-4 h-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>ประวัติเวอร์ชัน</span>
            </button>
          </div>
        </div>

        {/* Editable Template Metadata & Publish Button when on Steps tab */}
        {activeMainTab === "steps" && (
          <>
            <div className="grid gap-3 sm:grid-cols-12 border-t border-carbon-700/70 pt-3.5 items-end">
              <div className="sm:col-span-3 space-y-1">
                <label className="block text-[11px] text-ti-400">
                  รหัส Template (Code)
                </label>
                <input
                  type="text"
                  disabled
                  value={templateCode}
                  onChange={(e) => setTemplateCode(e.target.value)}
                  className="h-10 w-full rounded-control border border-carbon-600 bg-carbon-900 px-3 font-mono text-xs sm:text-sm text-ti-50 disabled:opacity-60"
                />
              </div>

              <div className="sm:col-span-4 space-y-1">
                <label className="block text-[11px] text-ti-400">
                  ชื่อ Template เช็คลิสต์ *
                </label>
                <input
                  type="text"
                  disabled={!canEdit}
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="เช่น Template 1 — ปั๊มลมลูกสูบมาตรฐาน"
                  className="h-10 w-full rounded-control border border-carbon-600 bg-carbon-900 px-3 text-xs sm:text-sm text-ti-50 focus:outline-none focus:ring-1 focus:ring-ember-500 disabled:opacity-60"
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="block text-[11px] text-ti-400">
                  ขอบเขต (Scope)
                </label>
                <input
                  type="text"
                  disabled={!canEdit}
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  placeholder="เช่น Piston, Oil-Free"
                  className="h-10 w-full rounded-control border border-carbon-600 bg-carbon-900 px-3 text-xs sm:text-sm text-ti-50 focus:outline-none focus:ring-1 focus:ring-ember-500 disabled:opacity-60"
                />
              </div>

              {canEdit && (
                <div className="sm:col-span-3">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handlePublishVersion}
                    className="h-10 w-full rounded-control app-primary-action bg-ember-500 hover:bg-ember-400 px-4 text-xs font-semibold text-carbon-900 shadow-sm disabled:opacity-50"
                  >
                    {isSaving
                      ? "กำลังบันทึก..."
                      : `บันทึกและเผยแพร่เป็น v${data.activeVersionNo + 1}`}
                  </button>
                </div>
              )}
            </div>

            {/* Linked Master Models Section */}
            {currentTemplate && (
              <div className="rounded-control border border-carbon-700 bg-carbon-900/60 p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ti-100">
                    รุ่นปั๊ม (Master Model) ที่ใช้ Template นี้อยู่ ({currentTemplate.linkedModels.length} รุ่น)
                  </span>
                  <Link
                    href="/master/models"
                    className="text-[11px] font-semibold text-ember-400 hover:text-ember-300 underline"
                  >
                    จัดการที่หน้ารุ่นปั๊ม (Master Model) →
                  </Link>
                </div>

                {currentTemplate.linkedModels.length === 0 ? (
                  <p className="text-xs text-ti-400">
                    ยังไม่มีรุ่นปั๊มที่เลือกใช้ Template นี้ — สามารถผูกจาก Dropdown ด้านล่าง หรือไปเลือกที่เมนู{" "}
                    <Link href="/master/models" className="text-ember-400 underline">
                      รุ่นปั๊ม (Model)
                    </Link>
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {currentTemplate.linkedModels.map((m) => (
                      <span
                        key={m.modelId}
                        className="inline-flex items-center gap-1.5 rounded bg-carbon-800 border border-carbon-600 px-2.5 py-1 text-xs text-ti-100"
                      >
                        <strong className="font-mono text-ember-300">{m.modelCode}</strong>
                        <span className="text-ti-400 text-[11px]">({m.brandName})</span>
                        {canEdit && (
                          <button
                            type="button"
                            disabled={isAssigningModel}
                            onClick={() => handleAssignModelToTemplate(m.modelId, null)}
                            className="ml-0.5 text-ti-400 hover:text-fail"
                            title={`ยกเลิกการผูก ${m.modelCode} กับ Template นี้`}
                          >
                            ✕
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                {canEdit && unlinkedModels.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <div className="min-w-56 flex-1 max-w-md">
                      <SearchSelect
                        value={quickModelId}
                        onChange={(v) => setQuickModelId(v)}
                        className="h-9 w-full rounded-control border border-carbon-600 bg-carbon-900 px-2.5 text-xs text-ti-100"
                        options={[
                          { value: "", label: "— เลือกรุ่นปั๊ม (Master Model) เพื่อผูกเข้ากับ Template นี้ —" },
                          ...unlinkedModels.map((m) => ({
                            value: String(m.modelId),
                            label: `${m.modelCode} — ${m.modelDescription ?? m.brandName} (${
                              m.templateId ? `ปัจจุบัน: ${m.templateCode}` : "ยังไม่ผูก Template"
                            })`,
                          })),
                        ]}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={!quickModelId || isAssigningModel}
                      onClick={() =>
                        handleAssignModelToTemplate(
                          Number(quickModelId),
                          currentTemplate.templateId,
                        )
                      }
                      className="h-9 rounded-control border border-ember-500/60 bg-ember-500/20 hover:bg-ember-500 hover:text-carbon-900 px-3.5 text-xs font-semibold text-ember-300 transition-colors disabled:opacity-40"
                    >
                      + ผูกรุ่นนี้เข้ากับ Template
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
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

      {/* TAB 1: CHECKLIST ORDERING & EDITING */}
      {activeMainTab === "steps" && (
        <div className="space-y-3" role="tabpanel">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold text-ti-100">
                การจัดลำดับเช็คลิสต์ของ {currentTemplate?.templateCode ?? templateCode} (ลำดับที่ 1 → {items.length})
              </h2>
              <p className="text-[11px] text-ti-400">
                กดปุ่ม ▲ / ▼ เพื่อสลับลำดับ เพิ่มข้อใหม่ แก้ไขรายละเอียด หรือลบข้อตรวจ แล้วกดบันทึกเผยแพร่เวอร์ชัน
              </p>
            </div>
            {canEdit && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsTemplateModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-control border border-carbon-600 bg-carbon-700/80 hover:bg-carbon-700 hover:border-ember-500/50 px-3 py-1.5 text-xs font-semibold text-ti-100 transition-colors shadow-sm"
                  title="เปิดหน้าต่างเลือกข้อตรวจมาตรฐานกลาง"
                >
                  <svg className="w-3.5 h-3.5 text-ember-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <span>ดึงจากคลังข้อตรวจมาตรฐาน ({data.masterPool.length})</span>
                </button>
                <button
                  type="button"
                  onClick={handleAddCustomBlankItem}
                  className="inline-flex items-center gap-1.5 rounded-control border border-ember-500/60 bg-ember-500/20 hover:bg-ember-500 hover:text-carbon-900 px-3 py-1.5 text-xs font-semibold text-ember-300 transition-colors"
                >
                  <span>+ เพิ่มข้อตรวจใหม่</span>
                </button>
              </div>
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
                          title="เลื่อนลำดับขึ้น"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          disabled={idx === items.length - 1}
                          onClick={() => handleMoveItem(idx, 1)}
                          className="size-7 rounded border border-carbon-600 bg-carbon-900 text-xs text-ti-300 hover:text-ti-50 disabled:opacity-30"
                          title="เลื่อนลำดับลง"
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

          {/* Bottom Add Step Card */}
          {canEdit && (
            <button
              type="button"
              onClick={handleAddCustomBlankItem}
              className="w-full py-3.5 px-4 rounded-panel border-2 border-dashed border-carbon-600 hover:border-ember-500/80 bg-carbon-800/40 hover:bg-carbon-800/80 text-ti-200 hover:text-ember-300 transition-all flex items-center justify-center gap-2 group font-semibold text-xs sm:text-sm shadow-sm"
            >
              <span className="w-6 h-6 rounded-full bg-carbon-700 group-hover:bg-ember-500 group-hover:text-carbon-900 flex items-center justify-center text-sm font-bold transition-colors">
                +
              </span>
              <span>สร้างขั้นตอนใหม่ต่อท้าย (ขั้นตอนที่ {items.length + 1})</span>
            </button>
          )}
        </div>
      )}

      {/* TAB 2: INLINE VERSION HISTORY & AUDIT LOGS */}
      {activeMainTab === "history" && currentTemplate && (
        <InlineTemplateHistoryPanel
          templateId={currentTemplate.templateId}
          role={data.role}
          templateCode={currentTemplate.templateCode}
          currentVersionNo={data.activeVersionNo}
          canEdit={canEdit}
          onSwitchedVersion={(switchedVerNo) => {
            setSaveBanner({
              tone: "pass",
              message: `สลับกลับมาใช้เวอร์ชัน v${switchedVerNo} เป็นเวอร์ชันปัจจุบันเรียบร้อยแล้ว`,
            });
            setActiveMainTab("steps");
            onSaved(currentTemplate.templateId);
          }}
        />
      )}

      {/* Common Master Checklist Pool Picker Modal */}
      {isTemplateModalOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="template-modal-title"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-carbon-950/80 backdrop-blur-sm transition-opacity"
            onClick={() => setIsTemplateModalOpen(false)}
            aria-hidden="true"
          />

          {/* Modal Container */}
          <div className="relative w-full max-w-2xl lg:max-w-4xl 2xl:max-w-5xl bg-carbon-850 border border-carbon-700 rounded-panel shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-carbon-700 bg-carbon-800 flex items-start justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-ember-500/20 border border-ember-500/40 px-2 py-0.5 font-mono text-xs font-bold text-ember-300">
                    Step Library
                  </span>
                  <span className="text-xs text-ti-400">
                    {data.masterPool.length} หัวข้อมาตรฐาน
                  </span>
                </div>
                <h3 id="template-modal-title" className="text-base sm:text-lg font-bold text-ti-50">
                  เลือกข้อตรวจจากคลังข้อตรวจมาตรฐานกลาง
                </h3>
                <p className="text-xs text-ti-400">
                  แตะเพื่อเพิ่มเข้า{" "}
                  <strong className="text-ti-200">{templateName || templateCode}</strong>
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsTemplateModalOpen(false)}
                className="w-9 h-9 flex items-center justify-center rounded-control hover:bg-carbon-700 text-ti-400 hover:text-ti-100 transition-colors"
                aria-label="ปิดหน้าต่างคลังข้อตรวจ"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5">
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {data.masterPool.map((poolItem, idx) => {
                  const alreadyInList = items.some((it) => it.title === poolItem.title);
                  return (
                    <div
                      key={idx}
                      className={`flex flex-col justify-between gap-2.5 rounded-control border p-3 transition-colors ${
                        alreadyInList
                          ? "border-carbon-700 bg-carbon-900/50"
                          : "border-carbon-700/80 bg-carbon-900/90 hover:border-carbon-600"
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          {poolItem.topicCode && (
                            <span className="font-mono text-[10px] text-ember-400 bg-carbon-800 px-1.5 py-0.5 rounded border border-carbon-700">
                              {poolItem.topicCode}
                            </span>
                          )}
                          <span className="font-mono text-[10px] text-ti-400">
                            {ANIMATION_TYPE_LABELS[poolItem.animationType]}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-ti-100 line-clamp-2">
                          {poolItem.title}
                        </p>
                        {poolItem.helpText && (
                          <p className="text-[11px] text-ti-400 line-clamp-2">
                            {poolItem.helpText}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-carbon-800/80">
                        <span className="text-[10px] text-ti-400 font-mono">
                          {poolItem.inputType} · รูป: {poolItem.photoRule}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAddFromMasterPool(poolItem)}
                          className={`rounded px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                            alreadyInList
                              ? "border border-carbon-600 bg-carbon-800 text-ti-300 hover:border-ember-400"
                              : "border border-ember-500/60 bg-ember-500/20 text-ember-300 hover:bg-ember-500 hover:text-carbon-900"
                          }`}
                        >
                          {alreadyInList ? "+ เพิ่มซ้ำ" : "+ เพิ่มเข้า Template"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-carbon-700 bg-carbon-800/90 flex items-center justify-between">
              <span className="text-xs text-ti-400">
                ปัจจุบันมี {items.length} ขั้นตอนใน Template นี้
              </span>
              <button
                type="button"
                onClick={() => setIsTemplateModalOpen(false)}
                className="h-9 px-4 rounded-control border border-carbon-600 bg-carbon-700 hover:bg-carbon-600 text-xs font-semibold text-ti-100 transition-colors"
              >
                เสร็จสิ้น
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InlineTemplateHistoryPanel({
  templateId,
  role,
  templateCode,
  currentVersionNo,
  canEdit,
  onSwitchedVersion,
}: {
  templateId: number;
  role: InspectionRole;
  templateCode: string;
  currentVersionNo: number;
  canEdit: boolean;
  onSwitchedVersion: (versionNo: number) => void;
}) {
  const [subTab, setSubTab] = useState<"versions" | "audit">("versions");
  const [expandedVersionId, setExpandedVersionId] = useState<number | null>(null);
  const [confirmSwitchVer, setConfirmSwitchVer] = useState<{
    versionId: number;
    versionNo: number;
    itemCount: number;
  } | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const { data, loading, error, reload } = useApiRead<ModelChecklistHistoryPayload>(
    `/api/master/model-checklists?history=1&templateId=${templateId}&role=${role}`,
  );

  const firstVersionId = data?.versions[0]?.versionId;
  const activeExpandedId = expandedVersionId ?? firstVersionId ?? null;

  async function handleExecuteSwitch(ver: { versionId: number; versionNo: number; itemCount: number }) {
    setIsSwitching(true);
    setSwitchError(null);
    try {
      const res = await fetch("/api/master/model-checklists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "switch_template_version",
          templateId,
          versionId: ver.versionId,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        status?: string;
        message?: string;
      };
      if (res.ok && json.status === "done") {
        setConfirmSwitchVer(null);
        invalidateApiReads();
        onSwitchedVersion(ver.versionNo);
      } else {
        setSwitchError(json.message ?? "ไม่สามารถสลับเวอร์ชันได้");
      }
    } catch {
      setSwitchError("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setIsSwitching(false);
    }
  }

  return (
    <div className="rounded-panel border border-carbon-700 bg-carbon-800 p-4 sm:p-5 space-y-4" role="tabpanel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-carbon-700 pb-3.5">
        <div className="space-y-0.5">
          <h2 className="text-sm sm:text-base font-semibold text-ti-50">
            ประวัติเวอร์ชันของ {templateCode}
          </h2>
          <p className="text-xs text-ti-400">
            ตรวจสอบลำดับข้อตรวจในแต่ละเวอร์ชัน และสามารถเลือกสลับกลับไปใช้เวอร์ชันเดิมได้ทันที
          </p>
        </div>

        <div className="inline-flex items-center gap-1.5 rounded-control border border-carbon-700 bg-carbon-900 p-1">
          <button
            type="button"
            onClick={() => setSubTab("versions")}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
              subTab === "versions"
                ? "bg-ember-500 text-carbon-900"
                : "text-ti-300 hover:text-ti-100"
            }`}
          >
            ไทม์ไลน์เวอร์ชัน ({data?.versions.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setSubTab("audit")}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
              subTab === "audit"
                ? "bg-ember-500 text-carbon-900"
                : "text-ti-300 hover:text-ti-100"
            }`}
          >
            บันทึกการแก้ไข ({data?.auditLogs.length ?? 0})
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="space-y-3 py-6">
          <div className="h-20 rounded-panel bg-carbon-900/60 animate-pulse border border-carbon-700" />
          <div className="h-20 rounded-panel bg-carbon-900/60 animate-pulse border border-carbon-700" />
          <p className="text-center text-xs text-ti-400">กำลังโหลดประวัติเวอร์ชัน…</p>
        </div>
      )}

      {error && <LoadError message={error} onRetry={reload} />}

      {!loading && !error && data && (
        <>
          {subTab === "versions" && (
            <div className="space-y-3">
              {data.versions.length === 0 ? (
                <div className="rounded-panel border border-carbon-700 bg-carbon-900/50 p-6 text-center text-xs text-ti-400">
                  ยังไม่มีบันทึกเวอร์ชันในระบบ
                </div>
              ) : (
                data.versions.map((ver) => {
                  const isCurrent = ver.versionNo === currentVersionNo;
                  const isExpanded = activeExpandedId === ver.versionId;

                  return (
                    <div
                      key={ver.versionId}
                      className={`rounded-panel border transition-all ${
                        isCurrent
                          ? "border-ember-500/50 bg-carbon-900/80 shadow-sm"
                          : "border-carbon-700 bg-carbon-900/40 hover:border-carbon-600"
                      }`}
                    >
                      <div className="p-3.5 sm:p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2.5 py-1 rounded font-mono text-xs font-bold ${
                                isCurrent
                                  ? "bg-ember-500 text-carbon-900"
                                  : "bg-carbon-700 text-ti-100"
                              }`}
                            >
                              v{ver.versionNo}
                            </span>
                            {isCurrent && (
                              <span className="rounded-full bg-pass/20 border border-pass/40 px-2 py-0.5 text-[10px] font-semibold text-pass">
                                เวอร์ชันที่ใช้งานปัจจุบัน
                              </span>
                            )}
                            <span className="text-xs text-ti-400">
                              · {ver.itemCount} ขั้นตอน
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {canEdit && !isCurrent && (
                              <button
                                type="button"
                                disabled={isSwitching}
                                onClick={() =>
                                  setConfirmSwitchVer({
                                    versionId: ver.versionId,
                                    versionNo: ver.versionNo,
                                    itemCount: ver.itemCount,
                                  })
                                }
                                className="inline-flex items-center gap-1.5 rounded-control border border-ember-500/60 bg-ember-500/15 hover:bg-ember-500 hover:text-carbon-900 px-2.5 py-1 text-xs font-semibold text-ember-300 transition-colors shadow-sm"
                                title={`สลับกลับมาใช้เวอร์ชัน v${ver.versionNo} เป็นเวอร์ชันปัจจุบัน`}
                              >
                                <svg
                                  className="w-3.5 h-3.5"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                  />
                                </svg>
                                <span>ตั้งเป็นเวอร์ชันปัจจุบัน</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                setExpandedVersionId(isExpanded ? 0 : ver.versionId)
                              }
                              className="text-xs text-ember-400 hover:text-ember-300 font-medium inline-flex items-center gap-1"
                            >
                              <span>{isExpanded ? "ซ่อนลำดับข้อตรวจ" : "ดูลำดับข้อตรวจ"}</span>
                              <svg
                                className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-ti-300">
                          <div className="flex items-center gap-1.5">
                            <span className="text-ti-400">📅 เผยแพร่เมื่อ: </span>
                            <span className="font-mono text-ti-100 font-medium">
                              {ver.publishedAt
                                ? new Date(ver.publishedAt).toLocaleString("th-TH", {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    second: "2-digit",
                                  }) + " น."
                                : "—"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-ti-400">👤 ผู้เผยแพร่: </span>
                            <span className="text-ti-100 font-medium">
                              {ver.publishedByName
                                ? `${ver.publishedByName} (${ver.publishedByCode ?? ""})`
                                : ver.publishedByCode ?? "ระบบ (System Seed)"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-carbon-700/70 bg-carbon-950/40 p-3 sm:p-4 space-y-2">
                          <h3 className="text-xs font-semibold text-ti-200">
                            ลำดับรายการข้อตรวจในเวอร์ชัน v{ver.versionNo}
                          </h3>
                          <ul className="divide-y divide-carbon-800 text-xs">
                            {ver.items.map((item) => (
                              <li key={item.seq} className="py-2 first:pt-0 last:pb-0 flex items-start gap-2.5">
                                <span className="w-5 h-5 rounded-full bg-carbon-700 flex items-center justify-center font-mono text-[10px] text-ti-300 shrink-0 mt-0.5">
                                  {item.seq}
                                </span>
                                <div className="min-w-0 flex-1 space-y-0.5">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {item.topicCode && (
                                      <span className="font-mono text-[10px] text-ember-400/90 bg-carbon-800 px-1.5 py-0.2 rounded border border-carbon-700">
                                        {item.topicCode}
                                      </span>
                                    )}
                                    <span className="font-medium text-ti-100">{item.title}</span>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-ti-400">
                                    <span>ชนิด: {item.inputType}</span>
                                    {item.isRequired && <span className="text-ember-400">· บังคับตรวจ</span>}
                                    {item.photoRule !== "NONE" && <span>· รูป: {item.photoRule}</span>}
                                    {item.videoRule !== "NONE" && <span>· วิดีโอ: {item.videoRule}</span>}
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {subTab === "audit" && (
            <div className="space-y-3">
              {data.auditLogs.length === 0 ? (
                <div className="rounded-panel border border-carbon-700 bg-carbon-900/50 p-6 text-center text-xs text-ti-400">
                  ยังไม่มีบันทึกการแก้ไขของ Template นี้
                </div>
              ) : (
                <div className="space-y-2.5">
                  {data.auditLogs.map((log) => {
                    const isSwitch =
                      log.description?.includes("สลับ") ||
                      log.action === "checklist_template.switch_version";
                    const isCreate =
                      log.action === "master.create" ||
                      log.description?.includes("สร้างเทมเพลต");
                    return (
                      <div
                        key={log.id}
                        className="rounded-panel border border-carbon-700 bg-carbon-900/70 p-3.5 space-y-2 text-xs hover:border-carbon-600 transition-colors"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-carbon-800 pb-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded px-2 py-0.5 font-mono text-[11px] font-bold ${
                                isSwitch
                                  ? "bg-amber-500/20 border border-amber-500/40 text-amber-300"
                                  : isCreate
                                  ? "bg-pass/20 border border-pass/40 text-pass"
                                  : "bg-carbon-700 text-ti-100"
                              }`}
                            >
                              {isSwitch
                                ? "🔄 สลับเวอร์ชันใช้งาน"
                                : isCreate
                                ? "✨ สร้างเทมเพลตใหม่"
                                : "📝 บันทึกแก้ไขเวอร์ชัน"}
                            </span>
                            {log.versionNo && (
                              <span className="rounded bg-carbon-800 border border-carbon-700 px-1.5 py-0.5 font-mono text-[11px] text-ti-200">
                                v{log.versionNo}
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-[11px] text-ti-300 flex items-center gap-1.5">
                            <span>📅</span>
                            <span>
                              {new Date(log.at).toLocaleString("th-TH", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              })}{" "}
                              น.
                            </span>
                          </span>
                        </div>

                        {log.description && (
                          <p className="text-xs font-medium text-ti-100">
                            {log.description}
                          </p>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-ti-300 pt-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-ti-400">👤 ผู้ดำเนินการ: </span>
                            <span className="font-medium text-ti-100">
                              {log.actorName
                                ? `${log.actorName} (${log.actorCode ?? ""})`
                                : log.actorCode ?? "ไม่ระบุ"}
                            </span>
                          </div>
                          {log.ip && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-ti-400">🌐 IP แอดเดรส: </span>
                              <span className="font-mono text-ti-300">{log.ip}</span>
                            </div>
                          )}
                          {log.itemCount && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-ti-400">📋 จำนวนขั้นตอน: </span>
                              <span className="text-ti-200">{log.itemCount} ข้อ</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Confirm Switch Version Modal */}
      {confirmSwitchVer && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="fixed inset-0 bg-carbon-950/80 backdrop-blur-sm transition-opacity"
            onClick={() => !isSwitching && setConfirmSwitchVer(null)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md bg-carbon-850 border border-carbon-700 rounded-panel p-5 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-ember-500/20 border border-ember-500/40 flex items-center justify-center text-ember-300 shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-ti-50">
                  ยืนยันการสลับเวอร์ชันปัจจุบัน
                </h3>
                <p className="text-xs text-ti-300 leading-relaxed">
                  คุณต้องการเปลี่ยนเวอร์ชันที่ใช้งานของ Template นี้เป็น{" "}
                  <strong className="text-ember-300 font-mono">v{confirmSwitchVer.versionNo}</strong>{" "}
                  ({confirmSwitchVer.itemCount} ขั้นตอน) ใช่หรือไม่?
                </p>
                <p className="text-[11px] text-ti-400 mt-1 bg-carbon-900/60 p-2.5 rounded border border-carbon-700">
                  ⚠️ แผนการตรวจที่กำลังดำเนินการ (Open / In Progress) ของทุกรุ่นที่ใช้ Template นี้ จะเปลี่ยนมาใช้ข้อตรวจเวอร์ชันนี้ทันที
                </p>
              </div>
            </div>

            {switchError && (
              <p className="text-xs text-fail bg-fail/10 border border-fail/40 rounded p-2">
                {switchError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-carbon-700/60">
              <button
                type="button"
                disabled={isSwitching}
                onClick={() => setConfirmSwitchVer(null)}
                className="h-9 px-3.5 rounded-control border border-carbon-600 bg-carbon-800 hover:bg-carbon-700 text-xs text-ti-200"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isSwitching}
                onClick={() => handleExecuteSwitch(confirmSwitchVer)}
                className="h-9 px-4 rounded-control bg-ember-500 hover:bg-ember-400 text-carbon-900 text-xs font-semibold shadow-sm disabled:opacity-50"
              >
                {isSwitching ? "กำลังสลับ..." : "ยืนยันตั้งเป็นเวอร์ชันปัจจุบัน"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
