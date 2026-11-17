"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import type { MasterValues } from "@/lib/master/form";
import type { MasterDef, MasterField } from "@/lib/master/registry";
import { saveMasterAction, setMasterActiveAction, type MasterFormState, type ToggleState } from "../actions";

export type FieldOptions = Record<string, { value: number; label: string; isActive: boolean }[]>;

const inputClass = "h-11 w-full rounded-[10px] border border-carbon-600 bg-carbon-900 px-3 text-sm text-ti-50 placeholder:text-ti-500 focus:border-ember-500 aria-invalid:border-red-400";
const idle: MasterFormState = { status: "idle" };

function Control({ field, value, options, invalid, describedBy }: { field: MasterField; value: MasterValues[string]; options: FieldOptions; invalid: boolean; describedBy?: string }) {
  const common = { name: field.key, "aria-invalid": invalid || undefined, "aria-describedby": describedBy, required: field.required };
  switch (field.kind) {
    case "text":
      return <input {...common} type="text" maxLength={field.max} defaultValue={value === null ? "" : String(value)} autoComplete="off" className={inputClass} />;
    case "number":
      return <input {...common} type="number" inputMode="numeric" min={field.min} max={field.maxValue} step={1} defaultValue={value === null ? "" : String(value)} className={inputClass} />;
    case "bool":
      return <input name={field.key} type="checkbox" defaultChecked={value === true} className="size-5 accent-ember-500" />;
    case "enum":
      return (
        <select {...common} defaultValue={value === null ? "" : String(value)} className={inputClass}>
          {!field.required && <option value="">— ไม่ระบุ —</option>}
          {field.required && value === null && <option value="" disabled>— เลือก —</option>}
          {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      );
    case "ref":
      return (
        <select {...common} defaultValue={value === null ? "" : String(value)} className={inputClass}>
          <option value="" disabled={field.required}>{field.required ? "— เลือก —" : "— ไม่ระบุ —"}</option>
          {(options[field.key] ?? [])
            .filter((option) => option.isActive || option.value === value)
            .map((option) => <option key={option.value} value={option.value}>{option.label}{option.isActive ? "" : " (ปิดใช้งาน)"}</option>)}
        </select>
      );
  }
}

/** Create / edit form generated from the registry definition. Shows field errors from the server. */
export function MasterForm({ def, id, values, options, cancelHref }: { def: MasterDef; id: number | null; values: MasterValues; options: FieldOptions; cancelHref: string }) {
  const [state, action, pending] = useActionState(saveMasterAction, idle);
  const base = useId();
  const current = state.status === "error" && state.values ? state.values : values;
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const title = id === null ? `เพิ่ม${def.singular}` : `แก้ไข${def.singular}`;
  return (
    // React resets a form after its action; re-keying restores what was typed when the server says no.
    <form key={state.status === "error" ? state.at : "initial"} action={action} aria-labelledby={`${base}-t`} className="space-y-4 app-panel rounded-xl border border-carbon-700 bg-carbon-800 p-5">
      <h2 id={`${base}-t`} className="text-lg font-medium text-ti-50">{title}</h2>
      <input type="hidden" name="slug" value={def.slug} />
      {id !== null && <input type="hidden" name="id" value={id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        {def.fields.map((field) => {
          const errorId = `${base}-${field.key}-e`;
          const helpId = `${base}-${field.key}-h`;
          const describedBy = [errors[field.key] ? errorId : "", field.help ? helpId : ""].filter(Boolean).join(" ") || undefined;
          return field.kind === "bool" ? (
            <label key={field.key} className="flex items-center gap-3 self-end py-2 text-sm text-ti-200">
              <Control field={field} value={current[field.key] ?? null} options={options} invalid={false} />
              {field.label}
            </label>
          ) : (
            <label key={field.key} className="block space-y-1 text-sm text-ti-400">
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
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className="h-11 rounded-[10px] app-primary-action bg-ember-500 px-5 text-sm font-semibold text-carbon-900 transition-colors hover:bg-ember-400 disabled:opacity-60">
          {pending ? "กำลังบันทึก…" : "บันทึก"}
        </button>
        <Link href={cancelHref} className="inline-flex h-11 items-center rounded-[10px] border border-ti-600 px-4 text-sm text-ti-200 hover:border-ti-400">ยกเลิก</Link>
      </div>
    </form>
  );
}

const toggleIdle: ToggleState = { status: "idle" };

export function ToggleActive({ slug, id, active, label }: { slug: string; id: number; active: boolean; label: string }) {
  const [state, action, pending] = useActionState(setMasterActiveAction, toggleIdle);
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (active && !window.confirm(`ปิดใช้งาน “${label}”? รายการเดิมที่อ้างถึงยังอยู่ แต่จะเลือกใช้ใหม่ไม่ได้`)) event.preventDefault();
      }}
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "0" : "1"} />
      <button type="submit" disabled={pending} className="h-9 rounded-[10px] border border-ti-600 px-3 text-xs text-ti-200 hover:border-ti-400 disabled:opacity-50">
        {active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
      </button>
      {state.status === "error" && <span role="alert" className="ml-2 text-xs text-red-300">{state.message}</span>}
    </form>
  );
}
