/** Placeholder cards while a list of cards loads, in the same grid as the list that replaces them. `label` is what a screen reader hears. */
export function CardsSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((index) => (
        <div key={index} aria-hidden="true" className="app-panel space-y-3 rounded-panel border border-carbon-700 bg-carbon-800 p-4">
          <div className="h-4 w-1/3 animate-pulse rounded bg-carbon-700" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-carbon-700" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-carbon-700" />
        </div>
      ))}
    </div>
  );
}
