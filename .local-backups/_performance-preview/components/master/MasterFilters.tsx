"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MasterStatusFilter } from "@/lib/master/table-query";
import { shouldDockMasterFilters } from "./filterDock";

type Props = { slug: string; singular: string; q: string; status: MasterStatusFilter };
type FieldFocus = { name: string; start: number | null; end: number | null };

/** One active search form moves between the card and header; its draft survives either location. */
export function MasterFilters({ slug, singular, q, status }: Props) {
  const [query, setQuery] = useState(q);
  const [pickedStatus, setPickedStatus] = useState(status === "all" ? "" : status);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [docked, setDocked] = useState(false);
  // The card form only animates when it comes back from the header, not on first paint.
  const [returning, setReturning] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const mode = useRef(false);
  const composing = useRef(false);
  const focus = useRef<FieldFocus | null>(null);
  const check = useRef<() => void>(() => {});

  useEffect(() => {
    const frame = requestAnimationFrame(() => setHost(document.getElementById("master-filter-dock")));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const slot = anchor.current;
    const header = host?.closest<HTMLElement>(".app-topbar");
    if (!slot || !header) return;
    const controller = new AbortController();
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (composing.current) return;
      const next = shouldDockMasterFilters(mode.current, slot.getBoundingClientRect().top, header.getBoundingClientRect().bottom);
      if (next === mode.current) return;
      const active = document.activeElement;
      const editing = form.current?.contains(active) && (active instanceof HTMLInputElement || active instanceof HTMLSelectElement);
      focus.current = editing ? {
        name: active.name,
        start: active instanceof HTMLInputElement ? active.selectionStart : null,
        end: active instanceof HTMLInputElement ? active.selectionEnd : null,
      } : null;
      mode.current = next;
      setDocked(next);
      if (!next) setReturning(true);
    };
    const wake = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    check.current = wake;
    const observer = new ResizeObserver(wake);
    observer.observe(slot);
    observer.observe(header);
    window.addEventListener("scroll", wake, { passive: true, signal: controller.signal });
    window.addEventListener("resize", wake, { passive: true, signal: controller.signal });
    wake();
    return () => {
      controller.abort();
      observer.disconnect();
      cancelAnimationFrame(frame);
      check.current = () => {};
    };
  }, [host]);

  useLayoutEffect(() => {
    const saved = focus.current;
    if (!saved) return;
    const field = form.current?.elements.namedItem(saved.name);
    if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) {
      field.focus({ preventScroll: true });
      if (field instanceof HTMLInputElement && saved.start !== null && saved.end !== null) field.setSelectionRange(saved.start, saved.end);
    }
    focus.current = null;
  }, [docked]);

  const renderForm = (compact: boolean, inactive = false) => (
    <form
      // Remount on every move so the CSS entrance (same fade/slide as the header title) replays.
      key={inactive ? "placeholder" : compact ? "docked" : "card"}
      ref={inactive ? undefined : form}
      method="get"
      action={`/master/${slug}`}
      className={`master-filters${compact ? " master-filters--docked" : ""}${inactive ? " master-filters--placeholder" : ""}${!compact && !inactive && returning ? " master-filters--return" : ""}`}
      role="search"
      aria-label={`ค้นหา${singular}`}
      aria-hidden={inactive || undefined}
      inert={inactive}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={() => { composing.current = false; check.current(); }}
    >
      <label className="master-filter-label master-search-field">
        <span className={compact ? "sr-only" : undefined}>ค้นหา{singular}</span>
        <span className="master-input-wrap">
          <svg className="master-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
          <input name="q" type="search" value={query} onChange={event => setQuery(event.target.value)} maxLength={100} placeholder={compact ? `ค้นหา${singular}…` : "ค้นหาจากรหัสหรือชื่อ…"} className="master-input" />
        </span>
      </label>
      <label className="master-filter-label">
        <span className={compact ? "sr-only" : undefined}>สถานะ</span>
        <select name="status" value={pickedStatus} onChange={event => setPickedStatus(event.target.value)} className="master-select">
          <option value="">ทั้งหมด</option>
          <option value="active">ใช้งาน</option>
          <option value="inactive">ปิดใช้งาน</option>
        </select>
      </label>
      <button type="submit" className="master-filter-button">ค้นหา</button>
    </form>
  );
  return <>
    {/* The inert placeholder preserves the card's size, including after a responsive resize. */}
    <div ref={anchor} className="master-filter-anchor">
      {docked ? renderForm(false, true) : renderForm(false)}
    </div>
    {docked && host && createPortal(renderForm(true), host)}
  </>;
}
