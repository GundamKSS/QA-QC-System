"use client";

import { useEffect, useId, useRef } from "react";

/** Native popovers stay above dialogs and scroll containers; touch and keyboard can open the same help. */
export function HelpTip({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => { if (timer.current) clearTimeout(timer.current); };
  const close = () => { cancelClose(); panel.current?.hidePopover(); };
  const delayClose = () => {
    cancelClose();
    if (document.activeElement !== trigger.current) timer.current = setTimeout(() => panel.current?.hidePopover(), 150);
  };
  const open = () => {
    cancelClose();
    const anchor = trigger.current?.getBoundingClientRect();
    const tip = panel.current;
    if (!anchor || !tip) return;
    tip.style.width = `${Math.min(300, window.innerWidth - 24)}px`;
    tip.style.left = `${Math.max(12, Math.min(anchor.left, window.innerWidth - Math.min(300, window.innerWidth - 24) - 12))}px`;
    tip.showPopover();
    const height = tip.getBoundingClientRect().height;
    tip.style.top = `${Math.max(12, anchor.bottom + height + 8 < window.innerHeight ? anchor.bottom + 8 : anchor.top - height - 8)}px`;
  };
  useEffect(() => {
    const dismiss = () => panel.current?.hidePopover();
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, []);

  return (
    <span className="inline-flex align-middle font-normal" onKeyDown={(event) => {
      if (event.key === "Escape" && panel.current?.matches(":popover-open")) {
        event.preventDefault(); event.stopPropagation(); close();
      }
    }}>
      <button ref={trigger} type="button" aria-label={label} aria-describedby={id}
        onMouseEnter={open} onMouseLeave={delayClose} onFocus={open} onBlur={close}
        onClick={(event) => { event.preventDefault(); open(); }}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-ti-500 transition-colors hover:bg-carbon-700/50 hover:text-ti-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-500">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="size-4">
          <circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" />
        </svg>
      </button>
      <span ref={panel} id={id} role="tooltip" popover="auto" onMouseEnter={cancelClose} onMouseLeave={delayClose}
        className="fixed inset-auto m-0 rounded-control border border-carbon-600 bg-carbon-800 px-3 py-2 text-left text-xs leading-relaxed text-ti-200 shadow-lg shadow-black/20">
        {children}
      </span>
    </span>
  );
}
