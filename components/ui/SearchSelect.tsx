"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type SearchSelectOption = { value: string; label: string; /** Extra text the search also matches (not shown). */ keywords?: string };

type Props = {
  options: readonly SearchSelectOption[];
  /** Form field name: a hidden input carries the picked value, so `<form action>` / GET forms work as with `<select>`. */
  name?: string;
  id?: string;
  /** Controlled value. Leave out (with `defaultValue`) for an uncontrolled field. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  searchPlaceholder?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "aria-labelledby"?: string;
};

const norm = (text: string) => text.normalize("NFKC").toLowerCase();

/**
 * A dropdown list you can search: type in the box to narrow the list, ↑ ↓ Enter to pick, Esc to close.
 * Takes the place of `<select>` everywhere (the value still goes out through a hidden input).
 */
export function SearchSelect({
  options, name, id, value, defaultValue = "", onChange, placeholder = "— เลือก —", disabled, className, searchPlaceholder = "พิมพ์เพื่อค้นหา…", ...aria
}: Props) {
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();

  const shown = useMemo(() => {
    const needle = norm(query.trim());
    if (!needle) return options;
    return options.filter((option) => norm(`${option.label} ${option.keywords ?? ""}`).includes(needle));
  }, [options, query]);
  const picked = options.find((option) => option.value === current);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  useEffect(() => {
    if (open) search.current?.focus();
  }, [open]);

  useEffect(() => {
    list.current?.children[active]?.scrollIntoView?.({ block: "nearest" });
  }, [active, open]);

  function openList() {
    if (disabled) return;
    setQuery("");
    setActive(Math.max(0, options.findIndex((option) => option.value === current)));
    setOpen(true);
  }

  function pick(option: SearchSelectOption) {
    setInner(option.value);
    onChange?.(option.value);
    setOpen(false);
  }

  function onKey(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(shown.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault(); // never submit the surrounding form from the search box
      if (shown[active]) pick(shown[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={root} className="relative min-w-0">
      {name && <input type="hidden" name={name} value={current} />}
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            openList();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-describedby={aria["aria-describedby"]}
        aria-labelledby={aria["aria-labelledby"]}
        data-invalid={aria["aria-invalid"] ? "true" : undefined}
        className={`${className ?? ""} ${aria["aria-invalid"] ? "border-red-400" : ""} flex items-center justify-between gap-2 text-left`}
      >
        <span className={`min-w-0 flex-1 truncate ${picked && picked.value !== "" ? "" : "text-ti-500"}`}>{picked && picked.value !== "" ? picked.label : (picked?.label ?? placeholder)}</span>
        <span aria-hidden="true" className="shrink-0 text-xs text-ti-500">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 rounded-control border border-carbon-600 bg-carbon-900 shadow-lg shadow-black/40">
          <input
            ref={search}
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
            placeholder={searchPlaceholder}
            autoComplete="off"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-label="ค้นหาในรายการ"
            className="h-10 w-full rounded-t-control border-b border-carbon-700 bg-carbon-900 px-3 text-sm text-ti-50 placeholder:text-ti-500 focus:outline-none"
          />
          <ul ref={list} id={listId} role="listbox" className="max-h-60 overflow-y-auto py-1">
            {shown.length === 0 && <li className="px-3 py-2 text-sm text-ti-500">ไม่พบรายการที่ค้นหา</li>}
            {shown.map((option, index) => (
              <li
                key={option.value}
                role="option"
                aria-selected={option.value === current}
                onPointerEnter={() => setActive(index)}
                onPointerDown={(event) => {
                  event.preventDefault();
                  pick(option);
                }}
                className={`cursor-pointer px-3 py-2 text-sm ${index === active ? "bg-carbon-700 text-ti-50" : "text-ti-200"} ${option.value === current ? "font-semibold text-ember-400" : ""}`}
              >
                {option.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
