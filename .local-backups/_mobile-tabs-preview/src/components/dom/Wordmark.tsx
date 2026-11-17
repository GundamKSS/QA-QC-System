import { palette } from "@/config/experience";

/** The Q ring with a check-mark tail. Also the app icon (src/app/icon.svg). */
export function QMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 34 32" fill="none" aria-hidden="true" className={className}>
      <path
        d="M18.59 24.87A10.5 10.5 0 1 1 24.87 18.59"
        stroke={palette.ti200}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M16.5 19.5 21 24l9-11"
        stroke={palette.ember500}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} aria-label="QCheck" role="img">
      <QMark className="h-7 w-auto" />
      <span aria-hidden="true" className="font-sans text-lg font-semibold tracking-[0.02em] text-ti-50">
        Check
      </span>
    </span>
  );
}
