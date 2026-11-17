"use client";

import { Accessibility } from "@dnd-kit/dom";
import { DragDropProvider, DragOverlay, useDraggable, useDroppable, type DragEndEvent, type DragOverEvent, type DragStartEvent } from "@dnd-kit/react";
import { useId, useMemo, useState } from "react";
import { MAX_ASSIGNEES, MIN_ASSIGNEES, teamAverage, WORKLOAD_LABELS, workloadOf, type WorkloadLevel } from "@/lib/plans/rules";
import type { Inspector, WorkOrderAssignee } from "@/lib/plans/store";
import { ASSIGNEE_FIELDS } from "@/lib/plans/work-orders";

/**
 * Pick 2–5 QC for a work order (docs/16 §4.1): drag a card onto a slot, or tap / Enter it to fill the
 * next empty slot. Each card shows how many open work orders the person holds against the team
 * average (W10–W11). Posts the slots as hidden inputs assignee1…assignee5.
 */

const TONE: Record<WorkloadLevel, { text: string; bar: string }> = {
  LOW: { text: "text-pass", bar: "bg-pass" },
  MID: { text: "text-ember-400", bar: "bg-ember-500" },
  HIGH: { text: "text-fail", bar: "bg-fail" },
};

type Person = { id: string; name: string; code: string; open: number; active: boolean };
type DragData = { personId: string; name: string };
type SlotData = { slot: number };

/** The chosen people in slot order (index 0 = slot 1 = main responsible QC). */
export type Picked = string[];

export function AssigneePicker({
  inspectors,
  value,
  onChange,
  current = [],
  error,
  unavailable = [],
}: {
  inspectors: Inspector[];
  value: Picked;
  onChange: (next: Picked) => void;
  /** Editing: the work order's people now — already counted in their open totals, and kept even if since deactivated. */
  current?: WorkOrderAssignee[];
  error?: string;
  unavailable?: string[];
}) {
  const base = useId();
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");

  const people = useMemo(() => {
    const map = new Map<string, Person>(inspectors.map((item) => [item.id, { id: item.id, name: item.name, code: item.code, open: item.openWorkOrders, active: true }]));
    for (const item of current) if (!map.has(item.userId)) map.set(item.userId, { id: item.userId, name: item.name, code: item.code, open: 0, active: false });
    return map;
  }, [inspectors, current]);
  const average = useMemo(() => teamAverage(inspectors.map((item) => item.openWorkOrders)), [inspectors]);
  const onThisOrder = useMemo(() => new Set(current.map((item) => item.userId)), [current]);

  /** Open work orders before → after saving this form. */
  const load = (person: Person) => {
    const before = person.open;
    const after = before - (onThisOrder.has(person.id) ? 1 : 0) + (value.includes(person.id) ? 1 : 0);
    return { before, after, gauge: workloadOf(after, average) };
  };
  const nameOf = (id: string) => people.get(id)?.name ?? id;

  const set = (next: Picked, message: string) => {
    onChange(next.slice(0, MAX_ASSIGNEES));
    setNotice(message);
  };
  const toggle = (id: string) => {
    if (value.includes(id)) return set(value.filter((item) => item !== id), `เอา ${nameOf(id)} ออกแล้ว`);
    if (value.length >= MAX_ASSIGNEES) return setNotice(`ครบ ${MAX_ASSIGNEES} คนแล้ว — เอาคนออกก่อน`);
    set([...value, id], `ใส่ ${nameOf(id)} ในช่อง ${value.length + 1}`);
  };
  /** Drop on slot n: move there (or insert); a full list swaps out whoever was in that slot. */
  const place = (id: string, slot: number) => {
    const without = value.filter((item) => item !== id);
    const index = Math.min(slot - 1, without.length);
    const next = [...without.slice(0, index), id, ...without.slice(index)];
    const dropped = next.length > MAX_ASSIGNEES ? next.splice(index + 1, 1)[0] : null;
    set(next, `วาง ${nameOf(id)} ในช่อง ${index + 1}${dropped ? ` แทน ${nameOf(dropped)}` : ""}`);
  };

  const term = query.trim().toLowerCase();
  const listed = [...people.values()]
    .filter((person) => person.active)
    .filter((person) => !term || person.name.toLowerCase().includes(term) || person.code.toLowerCase().includes(term))
    .sort((a, b) => a.open - b.open || a.name.localeCompare(b.name));
  const warnings = value.map((id) => people.get(id)).filter((person): person is Person => Boolean(person && load(person).gauge.level === "HIGH"));

  return (
    <DragDropProvider
      plugins={(defaults) =>
        defaults.map((plugin) =>
          plugin === Accessibility
            ? Accessibility.configure({
                screenReaderInstructions: { draggable: "กด Space เพื่อหยิบ ใช้ลูกศรเลื่อนไปที่ช่อง กด Space อีกครั้งเพื่อวาง หรือ Esc เพื่อยกเลิก" },
                announcements: {
                  dragstart: ({ operation }: DragStartEvent) => `หยิบ ${(operation.source?.data as DragData | undefined)?.name ?? ""}`,
                  dragover: ({ operation }: DragOverEvent) => {
                    const slot = (operation.target?.data as SlotData | undefined)?.slot;
                    return slot ? `อยู่เหนือช่อง ${slot}` : undefined;
                  },
                  dragend: ({ operation, canceled }: DragEndEvent) => {
                    const name = (operation.source?.data as DragData | undefined)?.name ?? "";
                    const slot = (operation.target?.data as SlotData | undefined)?.slot;
                    return canceled || !slot ? `ยกเลิกการลาก ${name}` : `วาง ${name} ในช่อง ${slot}`;
                  },
                },
              })
            : plugin,
        )
      }
      onDragEnd={(event) => {
        if (event.canceled) return;
        const source = event.operation.source?.data as DragData | undefined;
        const target = event.operation.target;
        if (!source) return;
        if (target?.id === `${base}-list`) {
          if (value.includes(source.personId)) set(value.filter((item) => item !== source.personId), `เอา ${source.name} ออกแล้ว`);
          return;
        }
        const slot = (target?.data as SlotData | undefined)?.slot;
        if (slot) place(source.personId, slot);
      }}
    >
      <fieldset aria-describedby={`${base}-help`} className="min-w-0 space-y-3">
        <legend className="text-sm text-ti-400">
          QC ผู้รับผิดชอบ ({MIN_ASSIGNEES}–{MAX_ASSIGNEES} คน) <span className="text-ember-400">*</span>
        </legend>
        <p id={`${base}-help`} className="text-xs text-ti-500">
          ลาก ⠿ ไปวางในช่อง หรือแตะชื่อเพื่อใส่ช่องว่างถัดไป · ช่อง 1 = ผู้รับผิดชอบหลัก · เกจ = ใบงานค้างเทียบค่าเฉลี่ยทีม ({Math.max(average, 1).toLocaleString("th-TH", { maximumFractionDigits: 1 })} ใบ = 50%)
        </p>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <ol className="space-y-2 lg:order-2" aria-label="ช่องผู้รับผิดชอบ">
            {Array.from({ length: MAX_ASSIGNEES }, (_, index) => {
              const id = value[index];
              const person = id ? people.get(id) : undefined;
              return (
                <Slot key={index} base={base} slot={index + 1} required={index < MIN_ASSIGNEES}>
                  {id && (
                    <Chip
                      base={base}
                      person={person ?? { id, name: id, code: "", open: 0, active: false }}
                      gauge={person ? load(person) : null}
                      unavailable={unavailable.includes(id) || (person ? !person.active : true)}
                      onRemove={() => set(value.filter((item) => item !== id), `เอา ${nameOf(id)} ออกแล้ว`)}
                    />
                  )}
                </Slot>
              );
            })}
          </ol>

          <ListArea base={base}>
            <label className="block">
              <span className="sr-only">ค้นหา QC</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ค้นหาชื่อ / รหัส"
                className="h-11 w-full rounded-control border border-carbon-600 bg-carbon-900 px-3 text-sm text-ti-50 placeholder:text-ti-500 focus:border-ember-500"
              />
            </label>
            {listed.length === 0 ? (
              <p className="rounded-control border border-dashed border-carbon-600 p-3 text-sm text-ti-400">
                {people.size === 0 ? "ยังไม่มีผู้ใช้บทบาท QC Inspector ที่ใช้งานอยู่ — QC ระบบกลางจะขึ้นหลัง login ครั้งแรก" : "ไม่พบชื่อที่ค้นหา"}
              </p>
            ) : (
              // A long team scrolls inside the box (search stays on top); on a laptop it ends level with the 5 slots.
              <ul className="max-h-[45dvh] space-y-2 overflow-y-auto overscroll-contain pr-1 lg:max-h-64" aria-label="QC ที่เลือกได้ (ว่างสุดก่อน)">
                {listed.map((person) => (
                  <Card key={person.id} base={base} person={person} slot={value.indexOf(person.id) + 1} load={load(person)} onToggle={() => toggle(person.id)} />
                ))}
              </ul>
            )}
          </ListArea>
        </div>

        {ASSIGNEE_FIELDS.map((field, index) => <input key={field} type="hidden" name={field} value={value[index] ?? ""} />)}
        <p aria-live="polite" className="sr-only">{notice}</p>
        {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
        {!error && warnings.length > 0 && (
          <p className="text-xs text-ember-400">⚠ ภาระงานสูง: {warnings.map((person) => person.name).join(", ")} — เลือกได้ แต่ควรกระจายงาน</p>
        )}
      </fieldset>

      <DragOverlay>
        {(source) => {
          const data = source?.data as DragData | undefined;
          return data ? <span className="inline-flex h-10 items-center rounded-control border border-ember-500 bg-carbon-800 px-3 text-sm text-ti-50 shadow-lg shadow-black/40">⠿ {data.name}</span> : null;
        }}
      </DragOverlay>
    </DragDropProvider>
  );
}

function Slot({ base, slot, required, children }: { base: string; slot: number; required: boolean; children: React.ReactNode }) {
  const { ref, isDropTarget } = useDroppable({ id: `${base}-slot-${slot}`, data: { slot } satisfies SlotData });
  return (
    <li
      ref={ref}
      className={`flex min-h-14 items-center gap-2 rounded-control border px-2 py-1.5 text-sm ${
        isDropTarget ? "border-ember-500 bg-ember-500/10" : children ? "border-carbon-600 bg-carbon-900" : "border-dashed border-carbon-600"
      }`}
    >
      <span className="w-7 shrink-0 text-center font-mono text-ti-400">
        {slot}
        {required && <span className="text-ember-400" aria-label="บังคับ">*</span>}
      </span>
      {children ?? <span className="text-ti-500">{required ? "บังคับ" : "ไม่บังคับ"} · วางที่นี่</span>}
    </li>
  );
}

function ListArea({ base, children }: { base: string; children: React.ReactNode }) {
  // Dropping a chosen person back on the list takes them out.
  const { ref, isDropTarget } = useDroppable({ id: `${base}-list` });
  return (
    <div ref={ref} className={`min-w-0 space-y-2 rounded-panel p-1 lg:order-1 ${isDropTarget ? "outline-2 outline-dashed outline-ember-500/60" : ""}`}>
      {children}
    </div>
  );
}

function Gauge({ before, after, gauge }: { before: number; after: number; gauge: ReturnType<typeof workloadOf> }) {
  const tone = TONE[gauge.level];
  return (
    <span className="block">
      <span className="flex items-center justify-between gap-2 text-xs">
        <span className="text-ti-400">ค้าง {before}{after !== before ? ` → ${after}` : ""} ใบงาน</span>
        <span className={tone.text}>
          {gauge.percent}% {gauge.over ? "เกินความจุ" : WORKLOAD_LABELS[gauge.level]}
        </span>
      </span>
      <span
        role="meter"
        aria-label="ภาระงาน"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, gauge.percent)}
        aria-valuetext={`${gauge.percent}% ${WORKLOAD_LABELS[gauge.level]}`}
        className="mt-1 block h-1.5 overflow-hidden rounded-full bg-carbon-700"
      >
        <span className={`block h-full rounded-full ${tone.bar}`} style={{ width: `${Math.min(100, gauge.percent)}%` }} />
      </span>
    </span>
  );
}

function Card({ base, person, slot, load, onToggle }: { base: string; person: Person; slot: number; load: { before: number; after: number; gauge: ReturnType<typeof workloadOf> }; onToggle: () => void }) {
  const { ref, handleRef, isDragSource } = useDraggable({ id: `${base}-person-${person.id}`, data: { personId: person.id, name: person.name } satisfies DragData });
  const chosen = slot > 0;
  return (
    <li ref={ref} className={`flex items-stretch gap-1 rounded-panel border bg-carbon-800 ${chosen ? "border-ember-500/70" : "border-carbon-600"} ${isDragSource ? "opacity-50" : ""}`}>
      <button
        ref={handleRef}
        type="button"
        aria-label={`ลาก ${person.name} ไปวางในช่อง`}
        className="flex w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-l-panel text-lg text-ti-500 hover:text-ti-200 active:cursor-grabbing"
      >
        ⠿
      </button>
      <button type="button" aria-pressed={chosen} onClick={onToggle} className="min-w-0 flex-1 space-y-0.5 py-2 pr-3 text-left">
        <span className="flex items-baseline justify-between gap-2 text-sm">
          <span className="truncate text-ti-50">
            {chosen && <span className="text-ember-400">✓ ช่อง {slot} · </span>}
            {person.name}
          </span>
          <span className="shrink-0 font-mono text-xs text-ti-500">{person.code}</span>
        </span>
        <Gauge {...load} />
      </button>
    </li>
  );
}

function Chip({
  base,
  person,
  gauge,
  unavailable,
  onRemove,
}: {
  base: string;
  person: Person;
  gauge: { before: number; after: number; gauge: ReturnType<typeof workloadOf> } | null;
  unavailable: boolean;
  onRemove: () => void;
}) {
  const { ref, handleRef, isDragSource } = useDraggable({ id: `${base}-chosen-${person.id}`, data: { personId: person.id, name: person.name } satisfies DragData });
  return (
    <span ref={ref} className={`flex min-w-0 flex-1 items-center gap-1 ${isDragSource ? "opacity-50" : ""}`}>
      <button
        ref={handleRef}
        type="button"
        aria-label={`ลาก ${person.name} ไปช่องอื่น`}
        className="flex h-9 w-7 shrink-0 cursor-grab touch-none items-center justify-center text-ti-500 hover:text-ti-200"
      >
        ⠿
      </button>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-ti-50">
          {person.name}
          {unavailable && <span className="ml-1 text-xs text-red-300">(ปิดใช้งาน/ไม่ใช่ QC แล้ว)</span>}
        </span>
        {gauge && <Gauge {...gauge} />}
      </span>
      <button type="button" onClick={onRemove} aria-label={`เอา ${person.name} ออก`} className="flex size-9 shrink-0 items-center justify-center rounded-control text-ti-400 hover:bg-carbon-700 hover:text-ti-50">
        ✕
      </button>
    </span>
  );
}
