"use client";

import { Accessibility } from "@dnd-kit/dom";
import { DragDropProvider, DragOverlay, useDraggable, useDroppable, type DragEndEvent, type DragOverEvent, type DragStartEvent } from "@dnd-kit/react";
import { HelpTip } from "@/components/dom/HelpTip";
import { WorkOrderIcon } from "@/components/plans/WorkOrderIcon";
import { useId, useMemo, useRef, useState } from "react";
import { MAX_ASSIGNEES, MIN_ASSIGNEES, splitAssigneeTargets, teamMax, workloadOf, type WorkloadLevel } from "@/lib/plans/rules";
import type { Inspector, WorkOrderAssignee } from "@/lib/plans/store";
import { assigneeFieldName, assigneeTargetFieldName, DEFAULT_ASSIGNEE_SLOTS } from "@/lib/plans/work-orders";

/**
 * Pick QC for a work order (docs/16 §4.1). Each card shows how many open work orders and units
 * remaining QC units against the team maximum; this is relative load, not daily capacity.
 */

const TONE: Record<WorkloadLevel, { text: string; bar: string }> = {
  LOW: { text: "text-pass", bar: "bg-pass" },
  MID: { text: "text-ember-400", bar: "bg-ember-500" },
  HIGH: { text: "text-fail", bar: "bg-fail" },
};

type Person = { id: string; name: string; code: string; open: number; openUnits: number; openModels?: number; active: boolean };
type DragData = { personId: string; name: string };
type SlotData = { slot: number };

/** The chosen people in slot order (index 0 = slot 1 = main responsible QC). */
export type Picked = string[];

export function AssigneePicker({
  inspectors,
  value,
  onChange,
  targets = [],
  onTargetsChange,
  totalQty = null,
  current = [],
  error,
  unavailable = [],
}: {
  inspectors: Inspector[];
  value: Picked;
  onChange: (next: Picked) => void;
  targets?: string[];
  onTargetsChange?: (next: string[]) => void;
  totalQty?: number | null;
  /** Editing: the work order's people now — already counted in their open totals, and kept even if since deactivated. */
  current?: WorkOrderAssignee[];
  error?: string;
  unavailable?: string[];
}) {
  const base = useId();
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const sheetRef = useRef<HTMLDialogElement>(null);

  const openSheet = () => sheetRef.current?.showModal();
  const closeSheet = () => sheetRef.current?.close();

  const people = useMemo(() => {
    const map = new Map<string, Person>(
      inspectors.map((item) => [
        item.id,
        {
          id: item.id,
          name: item.name,
          code: item.code,
          open: item.openWorkOrders,
          openUnits: item.openUnits ?? 0,
          openModels: item.openModels,
          active: true,
        },
      ]),
    );
    for (const item of current) {
      if (!map.has(item.userId)) {
        map.set(item.userId, {
          id: item.userId,
          name: item.name,
          code: item.code,
          open: 0,
          openUnits: 0,
          active: false,
        });
      }
    }
    return map;
  }, [inspectors, current]);

  const maxUnits = useMemo(() => {
    const counts = [...people.values()].filter((p) => p.active).map((p) => p.openUnits);
    return Math.max(teamMax(counts), 1);
  }, [people]);

  const onThisOrder = useMemo(() => new Set(current.map((item) => item.userId)), [current]);

  const targetSum = useMemo(() => {
    return targets.reduce((acc, curr) => {
      const n = Number((curr ?? "").replace(/,/g, "").trim());
      return acc + (!Number.isNaN(n) && n > 0 ? n : 0);
    }, 0);
  }, [targets]);

  /** Open work orders & units before → after saving this form. */
  const load = (person: Person) => {
    const before = person.open;
    const after = before - (onThisOrder.has(person.id) ? 1 : 0) + (value.includes(person.id) ? 1 : 0);
    const idx = value.indexOf(person.id);
    const assignedInThisOrder = idx !== -1 ? Number((targets[idx] ?? "").replace(/,/g, "").trim()) || 0 : 0;
    const unitsAfter = person.openUnits + assignedInThisOrder;

    return {
      before,
      after,
      unitsBefore: person.openUnits,
      unitsAfter,
      assignedInThisOrder,
      preview: current.length === 0 ? `หลังมอบหมาย: ${after} ใบ · ${unitsAfter} เครื่อง` : `หลังมอบหมาย ${after} ใบ`,
      gauge: workloadOf(person.openUnits, maxUnits, { mode: "max" }),
    };
  };
  const nameOf = (id: string) => people.get(id)?.name ?? id;

  const set = (next: Picked, message: string) => {
    onChange(next.slice(0, MAX_ASSIGNEES));
    setNotice(message);
  };
  const handleRemove = (id: string) => {
    const idx = value.indexOf(id);
    if (idx !== -1) {
      const nextTargets = targets.filter((_, i) => i !== idx);
      onTargetsChange?.(nextTargets);
    }
    set(value.filter((item) => item !== id), `เอา ${nameOf(id)} ออกแล้ว`);
  };
  const toggle = (id: string) => {
    const idx = value.indexOf(id);
    if (idx !== -1) {
      const nextTargets = targets.filter((_, i) => i !== idx);
      onTargetsChange?.(nextTargets);
      return set(value.filter((item) => item !== id), `เอา ${nameOf(id)} ออกแล้ว`);
    }
    if (value.length >= MAX_ASSIGNEES) return setNotice(`ครบ ${MAX_ASSIGNEES} คนแล้ว — เอาคนออกก่อน`);
    const nextTargets = [...targets, ""];
    onTargetsChange?.(nextTargets);
    set([...value, id], `ใส่ ${nameOf(id)} ในช่อง ${value.length + 1}`);
  };

  const moveUp = (index: number) => {
    if (index <= 0) return;
    const nextValue = [...value];
    const nextTargets = [...targets];
    while (nextTargets.length < nextValue.length) nextTargets.push("");
    [nextValue[index - 1], nextValue[index]] = [nextValue[index], nextValue[index - 1]];
    [nextTargets[index - 1], nextTargets[index]] = [nextTargets[index], nextTargets[index - 1]];
    onChange(nextValue);
    onTargetsChange?.(nextTargets);
    setNotice(`เลื่อน ${nameOf(nextValue[index - 1])} ขึ้นช่อง ${index}`);
  };

  const moveDown = (index: number) => {
    if (index >= value.length - 1) return;
    const nextValue = [...value];
    const nextTargets = [...targets];
    while (nextTargets.length < nextValue.length) nextTargets.push("");
    [nextValue[index + 1], nextValue[index]] = [nextValue[index], nextValue[index + 1]];
    [nextTargets[index + 1], nextTargets[index]] = [nextTargets[index], nextTargets[index + 1]];
    onChange(nextValue);
    onTargetsChange?.(nextTargets);
    setNotice(`เลื่อน ${nameOf(nextValue[index + 1])} ลงช่อง ${index + 2}`);
  };

  /** Drop on slot n: move there (or insert); a full list swaps out whoever was in that slot. */
  const place = (id: string, slot: number) => {
    const oldIdx = value.indexOf(id);
    const oldTarget = oldIdx !== -1 ? targets[oldIdx] ?? "" : "";
    const without = value.filter((item) => item !== id);
    const withoutTargets = targets.filter((_, i) => i !== oldIdx);
    const index = Math.min(slot - 1, without.length);
    const next = [...without.slice(0, index), id, ...without.slice(index)];
    const nextTargets = [...withoutTargets.slice(0, index), oldTarget, ...withoutTargets.slice(index)];
    const dropped = next.length > MAX_ASSIGNEES ? next.splice(index + 1, 1)[0] : null;
    if (nextTargets.length > MAX_ASSIGNEES) nextTargets.splice(index + 1, 1);
    onTargetsChange?.(nextTargets);
    set(next, `วาง ${nameOf(id)} ในช่อง ${index + 1}${dropped ? ` แทน ${nameOf(dropped)}` : ""}`);
  };

  const handleTargetChange = (slotIndex: number, val: string) => {
    const nextTargets = [...targets];
    while (nextTargets.length <= slotIndex) nextTargets.push("");
    nextTargets[slotIndex] = val;
    onTargetsChange?.(nextTargets);
  };

  const term = query.trim().toLowerCase();
  const listed = [...people.values()]
    .filter((person) => person.active)
    .filter((person) => !term || person.name.toLowerCase().includes(term) || person.code.toLowerCase().includes(term))
    .sort((a, b) => a.openUnits - b.openUnits || a.open - b.open || a.name.localeCompare(b.name));
  const desktopSlotCount = Math.min(MAX_ASSIGNEES, Math.max(MIN_ASSIGNEES, value.length + 1));
  const hiddenFieldCount = Math.max(DEFAULT_ASSIGNEE_SLOTS, value.length);

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
          ผู้ตรวจ QC <span className="text-ember-400">*</span>
        </legend>
        <div className="flex items-center justify-between gap-2 text-xs text-ti-400">
          <span id={`${base}-help`}>เลือกแล้ว {value.length} คน · ขั้นต่ำ {MIN_ASSIGNEES} คน</span>
          <HelpTip label="วิธีเลือกผู้ตรวจและอ่านเกจ">
            แตะรายชื่อหรือลากเข้าช่องเพื่อเลือกผู้ตรวจ ลำดับ 1 เป็นผู้รับผิดชอบหลัก เลือกเพิ่มได้ไม่จำกัด ใบงานที่ตรวจครบแต่ยังไม่ส่งจะยังนับเป็นใบค้าง เกจเทียบเครื่องค้างกับคนสูงสุดในทีม (100% = {maxUnits} เครื่อง) ไม่ใช่กำลังตรวจต่อวัน ยอดหลังมอบหมายยังไม่บันทึก
          </HelpTip>
        </div>

        {onTargetsChange && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-control border border-carbon-700 bg-carbon-900/50 p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-ti-200">จ่ายงานรายคน:</span>
              {totalQty !== null && totalQty !== undefined && totalQty > 0 && value.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const split = splitAssigneeTargets(totalQty, value.length);
                    onTargetsChange(split.map(String));
                    setNotice(`แบ่งเฉลี่ยคนละ ${split[0]} ตัวให้ครบ ${totalQty} ตัวแล้ว`);
                  }}
                  className="inline-flex h-7 items-center rounded-control border border-carbon-600 bg-carbon-800 px-2.5 text-xs font-medium text-ti-200 hover:border-ember-500 hover:text-ember-400 transition-colors"
                >
                  แบ่งเท่ากัน
                </button>
              )}
              {targets.some((t) => (t ?? "").trim() !== "") && (
                <button
                  type="button"
                  onClick={() => {
                    onTargetsChange(Array(value.length).fill(""));
                    setNotice("ล้างจำนวนรายคนแล้ว");
                  }}
                  className="inline-flex h-7 items-center rounded-control border border-transparent px-2 text-xs text-ti-400 hover:text-ti-200"
                >
                  ล้างค่า
                </button>
              )}
            </div>
            {totalQty !== null && totalQty !== undefined && totalQty > 0 && (
              <div className="text-xs flex flex-wrap items-center gap-1.5">
                <span className="text-ti-400">รวมที่จ่าย:</span>
                <span
                  className={`font-mono font-semibold ${
                    targetSum === totalQty ? "text-pass" : targetSum > totalQty ? "text-fail" : "text-ember-400"
                  }`}
                >
                  {targetSum} / {totalQty} ตัว
                </span>
                {targetSum > 0 && (
                  <span className="font-medium">
                    {targetSum === totalQty ? (
                      <span className="text-pass">ครบพอดี</span>
                    ) : targetSum > totalQty ? (
                      <span className="text-fail">เกิน {targetSum - totalQty} ตัว</span>
                    ) : (
                      <span className="text-ember-400">ขาดอีก {totalQty - targetSum} ตัว</span>
                    )}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* --- Mobile View (lg:hidden): Compact Cards + Top-Layer Dialog Picker --- */}
        <div className="space-y-3 lg:hidden">
          {value.length === 0 ? (
            <div className="rounded-panel border border-dashed border-carbon-600 p-5 text-center">
              <p className="text-sm font-medium text-ti-300">ยังไม่ได้เลือก QC ผู้ตรวจ</p>
              <p className="mt-1 text-xs text-ti-500">เลือกผู้ตรวจอย่างน้อย {MIN_ASSIGNEES} คน</p>
              <button
                type="button"
                onClick={openSheet}
                className="mt-3 inline-flex h-10 items-center justify-center gap-1.5 rounded-control app-primary-action bg-ember-500 px-4 text-xs font-semibold text-carbon-900 hover:bg-ember-400"
              >
                เลือกผู้ตรวจ
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {value.map((id, index) => {
                const person = people.get(id) ?? { id, name: id, code: "", open: 0, openUnits: 0, active: false };
                const loadInfo = people.has(id) ? load(person) : null;
                const isMain = index === 0;
                const targetVal = targets[index] ?? "";

                return (
                  <div
                    key={id}
                    className={`rounded-panel border bg-carbon-900/50 p-2.5 space-y-2 shadow-sm ${
                      isMain ? "border-ember-500/60" : "border-carbon-700"
                    }`}
                  >
                    {/* Row 1: Slot badge, Name, Reorder ▲ ▼, Remove ✕ */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${
                            isMain ? "bg-ember-500/20 text-ember-400 border border-ember-500/40" : "bg-carbon-700 text-ti-300"
                          }`}
                        >
                          #{index + 1} {isMain ? "หลัก" : ""}
                        </span>
                        <span className="font-medium text-sm text-ti-50 truncate">
                          {person.name}
                        </span>
                        {person.code && <span className="font-mono text-xs text-ti-500 shrink-0">({person.code})</span>}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => moveUp(index)}
                          aria-label={`เลื่อน ${person.name} ขึ้น`}
                          className="flex size-7 items-center justify-center rounded-control border border-carbon-700 bg-carbon-800 text-xs text-ti-400 hover:border-carbon-500 hover:text-ti-200 disabled:opacity-25 disabled:pointer-events-none"
                        >
                          <WorkOrderIcon name="up" />
                        </button>
                        <button
                          type="button"
                          disabled={index === value.length - 1}
                          onClick={() => moveDown(index)}
                          aria-label={`เลื่อน ${person.name} ลง`}
                          className="flex size-7 items-center justify-center rounded-control border border-carbon-700 bg-carbon-800 text-xs text-ti-400 hover:border-carbon-500 hover:text-ti-200 disabled:opacity-25 disabled:pointer-events-none"
                        >
                          <WorkOrderIcon name="down" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(id)}
                          aria-label={`เอา ${person.name} ออก`}
                          className="flex size-7 items-center justify-center rounded-control text-ti-400 hover:bg-carbon-700 hover:text-fail"
                        >
                          <WorkOrderIcon name="close" />
                        </button>
                      </div>
                    </div>

                    {/* Row 2: Capsule Gauge with jobs and units */}
                    {loadInfo && <Gauge open={loadInfo.before} units={loadInfo.unitsBefore} models={person.openModels} preview={current.length === 0 && value.includes(person.id) ? `หลังมอบหมาย ${loadInfo.after} ใบ · ${loadInfo.unitsAfter} เครื่อง` : undefined} gauge={loadInfo.gauge} />}

                    {/* Row 3: Target allocation */}
                    {onTargetsChange && (
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-carbon-700/60 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-ti-400 select-none">จ่ายงานใบนี้:</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={targetVal}
                            onChange={(e) => handleTargetChange(index, e.target.value)}
                            placeholder="0"
                            aria-label={`จำนวนตรวจของ ${person.name}`}
                            className="h-8 w-18 rounded-control border border-carbon-600 bg-carbon-900 px-2 text-right font-mono text-sm text-ti-50 focus:border-ember-500"
                          />
                          <span className="text-ti-400 select-none">ตัว</span>
                        </div>

                      </div>
                    )}
                  </div>
                );
              })}

              <button
                type="button"
                onClick={openSheet}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-control border border-dashed border-carbon-600 bg-carbon-900/40 px-4 text-xs font-medium text-ti-200 hover:border-ember-500 hover:text-ember-400 transition-colors"
              >
                <WorkOrderIcon name="plus" />
                <span>จัดการผู้ตรวจ ({value.length})</span>
              </button>
            </div>
          )}
        </div>

        {/* --- Native Top-Layer <dialog> Modal: Immune to parent transform, stays 100% locked in viewport --- */}
        <dialog
          ref={sheetRef}
          aria-label="เลือก QC ผู้รับผิดชอบ"
          onClick={(e) => {
            if (e.target === sheetRef.current) closeSheet();
          }}
          className="m-auto w-[min(28rem,calc(100vw-1.5rem))] app-panel rounded-panel border border-carbon-600 bg-carbon-800 p-0 text-ti-50 shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-xs"
        >
          <div className="flex max-h-[82dvh] flex-col p-4 space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-ti-50">เลือก QC ผู้รับผิดชอบ</h3>
                <p className="text-xs text-ti-400">
                  เลือกแล้ว {value.length} คน · ขั้นต่ำ {MIN_ASSIGNEES} คน
                </p>
              </div>
              <button
                type="button"
                onClick={closeSheet}
                className="flex size-8 shrink-0 items-center justify-center rounded-control text-ti-400 hover:bg-carbon-700 hover:text-ti-50"
                aria-label="ปิดหน้าต่างเลือก QC"
              >
                <WorkOrderIcon name="close" />
              </button>
            </div>

            {/* Search */}
            <label className="block">
              <span className="sr-only">ค้นหา QC</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ค้นหาชื่อ / รหัสพนักงาน"
                className="h-10 w-full rounded-control border border-carbon-600 bg-carbon-900 px-3 text-sm text-ti-50 placeholder:text-ti-500 focus:border-ember-500"
              />
            </label>

            {/* Inspector List — fixed height so dialog never resizes or shifts when tapping + */}
            <div className="h-[46dvh] overflow-y-auto overscroll-contain space-y-2 pr-1">
              {listed.length === 0 ? (
                <p className="rounded-control border border-dashed border-carbon-600 p-4 text-center text-sm text-ti-400">
                  {people.size === 0 ? "ยังไม่มีผู้ใช้บทบาท QC Inspector" : "ไม่พบชื่อที่ค้นหา"}
                </p>
              ) : (
                listed.map((person) => {
                  const isSelected = value.includes(person.id);
                  const slotIndex = isSelected ? value.indexOf(person.id) + 1 : 0;
                  const loadInfo = load(person);

                  return (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => toggle(person.id)}
                      className={`flex w-full flex-col gap-1.5 rounded-control border p-2.5 text-left transition-colors ${
                        isSelected
                          ? "border-ember-500 bg-ember-500/12"
                          : "border-carbon-700 bg-carbon-900/50 hover:border-carbon-600"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 w-full">
                        <span
                          className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                            isSelected
                              ? "bg-ember-500 text-carbon-900"
                              : "border border-carbon-600 bg-carbon-800 text-ti-400"
                          }`}
                        >
                          {isSelected ? slotIndex : <WorkOrderIcon name="plus" />}
                        </span>
                        <span className="text-sm font-medium text-ti-50 truncate flex-1">
                          {person.name}
                        </span>
                        <span className="font-mono text-xs text-ti-500 shrink-0">
                          {person.code}
                        </span>
                      </div>
                      <Gauge open={loadInfo.before} units={loadInfo.unitsBefore} models={person.openModels} preview={current.length === 0 && value.includes(person.id) ? `หลังมอบหมาย ${loadInfo.after} ใบ · ${loadInfo.unitsAfter} เครื่อง` : undefined} gauge={loadInfo.gauge} />
                    </button>
                  );
                })
              )}
            </div>

            {/* Bottom bar inside dialog */}
            <div className="border-t border-carbon-700 pt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-ti-300">
                {value.length < MIN_ASSIGNEES ? (
                  <span className="text-ember-400 font-medium">เลือกอีก {MIN_ASSIGNEES - value.length} คน</span>
                ) : (
                  <span className="text-pass font-medium">เลือกแล้ว {value.length} คน</span>
                )}
              </span>
              <button
                type="button"
                onClick={closeSheet}
                className="h-10 rounded-control app-primary-action bg-ember-500 px-5 text-sm font-semibold text-carbon-900 hover:bg-ember-400"
              >
                เสร็จสิ้น ({value.length})
              </button>
            </div>
          </div>
        </dialog>

        {/* --- Desktop View (hidden lg:grid): Dynamic Slots (Grows as you press +) + Search List --- */}
        <div className="hidden lg:grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <ol className="space-y-2 lg:order-2" aria-label="ช่องผู้รับผิดชอบ">
            {Array.from({ length: desktopSlotCount }, (_, index) => {
              const id = value[index];
              const person = id ? people.get(id) : undefined;
              return (
                <Slot key={index} base={base} slot={index + 1} required={index < MIN_ASSIGNEES}>
                  {id && (
                    <Chip
                      base={base}
                      person={person ?? { id, name: id, code: "", open: 0, openUnits: 0, active: false }}
                      target={targets[index]}
                      onTargetChange={onTargetsChange ? (val) => handleTargetChange(index, val) : undefined}
                      load={person ? load(person) : null}
                      unavailable={unavailable.includes(id) || (person ? !person.active : true)}
                      onRemove={() => handleRemove(id)}
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
              <ul className="max-h-80 space-y-2 overflow-y-auto overscroll-contain pr-1" aria-label="QC ที่เลือกได้ (ว่างสุดก่อน)">
                {listed.map((person) => (
                  <Card key={person.id} base={base} person={person} slot={value.indexOf(person.id) + 1} load={load(person)} onToggle={() => toggle(person.id)} />
                ))}
              </ul>
            )}
          </ListArea>
        </div>

        {Array.from({ length: hiddenFieldCount }, (_, index) => (
          <input key={`a-${index}`} type="hidden" name={assigneeFieldName(index)} value={value[index] ?? ""} />
        ))}
        {Array.from({ length: hiddenFieldCount }, (_, index) => (
          <input key={`q-${index}`} type="hidden" name={assigneeTargetFieldName(index)} value={targets[index] ?? ""} />
        ))}
        <p aria-live="polite" className="sr-only">{notice}</p>
        {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      </fieldset>

      <DragOverlay>
        {(source) => {
          const data = source?.data as DragData | undefined;
          return data ? <span className="inline-flex h-10 items-center rounded-control border border-ember-500 bg-carbon-800 px-3 text-sm text-ti-50 shadow-lg shadow-black/40"><WorkOrderIcon name="grip" /> {data.name}</span> : null;
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
      className={`flex min-h-[3.75rem] items-center gap-2 rounded-control border px-2.5 py-2 text-sm ${
        isDropTarget ? "border-ember-500 bg-ember-500/10" : children ? "border-carbon-600 bg-carbon-900" : "border-dashed border-carbon-600"
      }`}
    >
      <span className="w-6 shrink-0 text-center font-mono text-ti-400">
        {slot}
        {required && <span className="text-ember-400" aria-label="บังคับ">*</span>}
      </span>
      {children ?? <span className="text-ti-500">{required ? "บังคับ" : "ไม่บังคับ"} · วางที่นี่</span>}
    </li>
  );
}

function ListArea({ base, children }: { base: string; children: React.ReactNode }) {
  const { ref, isDropTarget } = useDroppable({ id: `${base}-list` });
  return (
    <div ref={ref} className={`min-w-0 space-y-2 rounded-panel p-1 lg:order-1 ${isDropTarget ? "outline-2 outline-dashed outline-ember-500/60" : ""}`}>
      {children}
    </div>
  );
}

function Gauge({
  open,
  units,
  gauge,
  models,
  preview,
}: {
  models?: number;
  preview?: string;
  open: number;
  units?: number;
  gauge: ReturnType<typeof workloadOf>;
}) {
  const tone = TONE[gauge.level];
  const label = gauge.percent === 0 ? "ไม่มีเครื่องค้าง" : "เทียบทีม";
  const percent = Math.min(100, Math.max(0, gauge.percent));

  return (
    <div className="space-y-1">
      <div
        role="meter"
        aria-label="เครื่องค้างเทียบคนสูงสุดในทีม"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`ค้าง ${open} ใบ ${models !== undefined ? `${models} รุ่น ` : ""}${units ?? 0} เครื่อง ${percent}% ${label}`}
        className="relative flex min-h-7 w-full items-center overflow-hidden rounded-control border border-carbon-700 bg-carbon-900/90 text-xs"
      >
        <div
          className={`absolute inset-y-0 left-0 transition-all duration-300 ${
            gauge.level === "HIGH"
              ? "bg-fail/30 border-r-2 border-fail"
              : gauge.level === "MID"
                ? "bg-ember-500/30 border-r-2 border-ember-500"
                : "bg-pass/30 border-r-2 border-pass"
          }`}
          style={{ width: `${percent}%` }}
        />
        <div className="relative z-10 flex w-full items-center justify-between px-2 text-[11px] font-medium leading-snug text-ti-50 select-none">
          <span className="font-semibold min-w-0">
            ค้าง {open} ใบ{models !== undefined ? ` · ${models} รุ่น` : ""} · {(units ?? 0).toLocaleString("th-TH")} เครื่อง
          </span>
          <span className={`shrink-0 font-mono font-semibold ml-1.5 ${tone.text}`}>
            {percent}% {label}
          </span>
        </div>
      </div>
      {preview && <p className="text-[11px] text-ti-400">{preview}</p>}
    </div>
  );
}

function Card({
  base,
  person,
  slot,
  load,
  onToggle,
}: {
  base: string;
  person: Person;
  slot: number;
  load: { before: number; after: number; unitsBefore: number; unitsAfter: number; preview?: string; gauge: ReturnType<typeof workloadOf> };
  onToggle: () => void;
}) {
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
        <WorkOrderIcon name="grip" />
      </button>
      <button type="button" aria-pressed={chosen} onClick={onToggle} className="min-w-0 flex-1 space-y-1.5 py-2 pr-3 text-left">
        <span className="flex items-baseline justify-between gap-2 text-sm">
          <span className="truncate text-ti-50">
            {chosen && <span className="text-ember-400">ช่อง {slot} · </span>}
            {person.name}
          </span>
          <span className="shrink-0 font-mono text-xs text-ti-500">{person.code}</span>
        </span>
        <Gauge preview={chosen ? load.preview : undefined} open={load.before} units={load.unitsBefore} models={person.openModels} gauge={load.gauge} />
      </button>
    </li>
  );
}

function Chip({
  base,
  person,
  target,
  onTargetChange,
  load,
  unavailable,
  onRemove,
}: {
  base: string;
  person: Person;
  target?: string;
  onTargetChange?: (value: string) => void;
  load: { before: number; after: number; unitsBefore: number; unitsAfter: number; preview?: string; gauge: ReturnType<typeof workloadOf> } | null;
  unavailable: boolean;
  onRemove: () => void;
}) {
  const { ref, handleRef, isDragSource } = useDraggable({ id: `${base}-chosen-${person.id}`, data: { personId: person.id, name: person.name } satisfies DragData });
  return (
    <span ref={ref} className={`flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center gap-2 ${isDragSource ? "opacity-50" : ""}`}>
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <button
          ref={handleRef}
          type="button"
          aria-label={`ลาก ${person.name} ไปช่องอื่น`}
          className="flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-ti-500 hover:text-ti-200"
        >
          <WorkOrderIcon name="grip" />
        </button>
        <span className="min-w-0 flex-1 space-y-1">
          <span className="block truncate text-ti-50 text-sm font-medium">
            {person.name}
            {unavailable && <span className="ml-1 text-xs text-red-300">(ปิดใช้งาน/ไม่ใช่ QC แล้ว)</span>}
          </span>
          {load && <Gauge preview={load.preview} open={load.before} units={load.unitsBefore} models={person.openModels} gauge={load.gauge} />}
        </span>
      </span>
      <span className="flex shrink-0 items-center justify-end gap-1.5 pl-7 sm:pl-0">
        {onTargetChange && (
          <span className="flex shrink-0 items-center gap-1">
            <span className="text-xs text-ti-400 select-none">จ่ายงาน:</span>
            <input
              type="text"
              inputMode="numeric"
              value={target ?? ""}
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => onTargetChange(e.target.value)}
              placeholder="0"
              aria-label={`จำนวนที่มอบหมายให้ ${person.name}`}
              className="h-8 w-16 rounded-control border border-carbon-600 bg-carbon-900 px-2 text-right font-mono text-sm text-ti-50 placeholder:text-ti-500 focus:border-ember-500"
            />
            <span className="text-xs text-ti-400 select-none">ตัว</span>
          </span>
        )}
        <button type="button" onClick={onRemove} aria-label={`เอา ${person.name} ออก`} className="flex size-8 shrink-0 items-center justify-center rounded-control text-ti-400 hover:bg-carbon-700 hover:text-ti-50">
          <WorkOrderIcon name="close" />
        </button>
      </span>
    </span>
  );
}
