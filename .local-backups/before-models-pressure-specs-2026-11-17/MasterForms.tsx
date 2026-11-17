"use client";

import { SearchSelect } from "@/components/ui/SearchSelect";
import Link from "next/link";
import { useId } from "react";
import { useApiAction } from "@/lib/api/client";
import { parseMasterForm, type MasterFormState, type MasterValues, type ToggleState } from "@/lib/master/form";
import type { MasterDef, MasterField } from "@/lib/master/registry";
import type { MasterFieldOptions } from "@/lib/master/table";

export type FieldOptions = MasterFieldOptions;

const inputClass = "h-11 min-w-0 w-full rounded-control border border-carbon-600 bg-carbon-900 px-3 text-sm text-ti-50 placeholder:text-ti-500 focus:border-ember-500 aria-invalid:border-red-400";
const idle: MasterFormState = { status: "idle" };

function Control({ field, value, options, invalid, describedBy }: { field: MasterField; value: MasterValues[string]; options: FieldOptions; invalid: boolean; describedBy?: string }) {
  // Database-generated (e.g. DEF00001): shown for reference, no name so it is never submitted.
  if (field.generated) {
    return <input type="text" readOnly value={value === null ? "" : String(value)} placeholder="ออกให้เมื่อบันทึก" aria-describedby={describedBy} className={`${inputClass} cursor-default border-dashed text-ti-300`} />;
  }
  const common = { name: field.key, "aria-invalid": invalid || undefined, "aria-describedby": describedBy, required: field.required };
  switch (field.kind) {
    case "text":
      return <input {...common} type="text" maxLength={field.max} defaultValue={value === null ? "" : String(value)} autoComplete="off" className={inputClass} />;
    case "number":
      return <input {...common} type="number" inputMode="numeric" min={field.min} max={field.maxValue} step={1} defaultValue={value === null ? "" : String(value)} className={inputClass} />;
    case "bool":
      return <input name={field.key} type="checkbox" defaultChecked={value === true} className="size-5 shrink-0 accent-ember-500" />;
    case "enum":
      return (
        <SearchSelect
          name={field.key}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          defaultValue={value === null ? "" : String(value)}
          className={inputClass}
          options={[
            { value: "", label: field.required ? "— เลือก —" : "— ไม่ระบุ —" },
            ...field.options.map((option) => ({ value: option.value, label: option.label })),
          ]}
        />
      );
    case "ref":
      return (
        <SearchSelect
          name={field.key}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          defaultValue={value === null ? "" : String(value)}
          className={inputClass}
          options={[
            { value: "", label: field.required ? "— เลือก —" : "— ไม่ระบุ —" },
            ...(options[field.key] ?? [])
              .filter((option) => option.isActive || option.value === value)
              .map((option) => ({ value: String(option.value), label: `${option.label}${option.isActive ? "" : " (ปิดใช้งาน)"}` })),
          ]}
        />
      );
  }
}

/** Create / edit form generated from the registry definition. Shows field errors from the server. */
export function MasterForm({ def, id, values, options, cancelHref }: { def: MasterDef; id: number | null; values: MasterValues; options: FieldOptions; cancelHref: string }) {
  // A refusal that has no typed values (network down) keeps what was typed by reading it back from the sent form.
  const failed = (message: string, formData: FormData): MasterFormState => ({
    status: "error",
    message,
    values: parseMasterForm(def, (key) => { const value = formData.get(key); return typeof value === "string" ? value : null; }).values,
    at: Date.now(),
  });
  const [state, action, pending] = useApiAction(id === null ? `/api/master/${def.slug}` : `/api/master/${def.slug}/${id}`, idle, failed, id === null ? "POST" : "PATCH");
  const base = useId();
  const current = state.status === "error" && state.values ? state.values : values;
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const title = id === null ? `เพิ่ม${def.singular}` : `แก้ไข${def.singular}`;
  return (
    // React resets a form after its action; re-keying restores what was typed when the server says no.
    <form key={state.status === "error" ? state.at : "initial"} action={action} aria-labelledby={`${base}-t`} className="@container min-w-0 space-y-5 app-panel rounded-panel border border-carbon-700 bg-carbon-800 p-4 sm:p-5">
      <h2 id={`${base}-t`} className="text-lg font-medium text-ti-50">{title}</h2>
      <div className="grid min-w-0 gap-4 @min-[36rem]:grid-cols-2">
        {def.fields.map((field) => {
          const errorId = `${base}-${field.key}-e`;
          const helpId = `${base}-${field.key}-h`;
          const describedBy = [errors[field.key] ? errorId : "", field.help ? helpId : ""].filter(Boolean).join(" ") || undefined;
          return field.kind === "bool" ? (
            <label key={field.key} className="flex min-h-11 min-w-0 items-center gap-3 self-end rounded-control border border-carbon-700 bg-carbon-900/50 px-3 py-3 text-sm text-ti-200">
              <Control field={field} value={current[field.key] ?? null} options={options} invalid={false} />
              {field.label}
            </label>
          ) : (
            <label key={field.key} className={`block min-w-0 space-y-1.5 text-sm text-ti-400 ${field.kind === "text" && field.max > 150 ? "@min-[36rem]:col-span-2" : ""}`}>
              <span>{field.label}{field.required && " *"}</span>
              <Control field={field} value={current[field.key] ?? null} options={options} invalid={Boolean(errors[field.key])} describedBy={describedBy} />
              {field.help && <span id={helpId} className="block text-xs text-ti-500">{field.help}</span>}
              {field.kind === "ref" && !(options[field.key] ?? []).some((option) => option.isActive) && (
                <span className="block text-xs text-ember-400">ยังไม่มี{field.label}ที่ใช้งานอยู่ — เพิ่มที่หน้า{field.label}ก่อน</span>
              )}
              {errors[field.key] && <span id={errorId} className="block text-xs text-red-300">{errors[field.key]}</span>}
            </label>
          );
        })}
      </div>
      {state.status === "error" && <p role="alert" className="text-sm text-red-300">{state.message}</p>}
      <div className="flex flex-col gap-3 border-t border-carbon-700 pt-4 @min-[28rem]:flex-row">
        <button type="submit" disabled={pending} className="min-h-11 w-full rounded-control app-primary-action bg-ember-500 px-5 text-sm font-semibold text-carbon-900 transition-colors hover:bg-ember-400 disabled:opacity-60 @min-[28rem]:w-auto">
          {pending ? "กำลังบันทึก…" : "บันทึก"}
        </button>
        <Link href={cancelHref} className="inline-flex min-h-11 w-full items-center justify-center rounded-control border border-ti-600 px-4 text-sm text-ti-200 hover:border-ti-400 @min-[28rem]:w-auto">ยกเลิก</Link>
      </div>
    </form>
  );
}

const toggleIdle: ToggleState = { status: "idle" };
const toggleFailed = (message: string): ToggleState => ({ status: "error", message });

export function ToggleActive({ slug, id, active, label, className = "" }: { slug: string; id: number; active: boolean; label: string; className?: string }) {
  const [state, action, pending] = useApiAction(`/api/master/${slug}/${id}/active`, toggleIdle, toggleFailed);
  return (
    <form
      action={action}
      className="min-w-0"
      onSubmit={(event) => {
        if (active && !window.confirm(`ปิดใช้งาน “${label}”? รายการเดิมที่อ้างถึงยังอยู่ แต่จะเลือกใช้ใหม่ไม่ได้`)) event.preventDefault();
      }}
    >
      <input type="hidden" name="active" value={active ? "0" : "1"} />
      <button type="submit" disabled={pending} aria-busy={pending} aria-label={`${pending ? "กำลังเปลี่ยนสถานะ" : active ? "ปิดใช้งาน" : "เปิดใช้งาน"} ${label}`} className={`inline-flex min-h-11 max-w-full items-center justify-center rounded-control border border-ti-600 px-3 text-xs text-ti-200 hover:border-ti-400 disabled:opacity-50 ${className}`}>
        {pending ? "กำลังเปลี่ยน…" : active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
      </button>
      {state.status === "error" && <span role="alert" className="mt-2 block text-xs text-red-300">{state.message}</span>}
    </form>
  );
}
