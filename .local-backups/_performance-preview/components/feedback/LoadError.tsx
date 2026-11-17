/** The bar a screen shows when its `GET` failed: the sentence the API sent (or the shared network one) and a retry button. */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-control border border-red-500/50 bg-carbon-800 px-3 py-2 text-sm text-red-300">
      <span className="min-w-0 flex-1">{message}</span>
      <button type="button" onClick={onRetry} className="min-h-11 shrink-0 rounded-control border border-carbon-600 px-3 text-ti-200 transition-colors hover:border-ti-400 hover:text-ti-50">
        ลองอีกครั้ง
      </button>
    </div>
  );
}
