export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <span className="sr-only">Laden…</span>
      <div className="h-8 w-64 animate-pulse rounded bg-zinc-200" />
      <div className="grid gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-zinc-200" />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-lg bg-zinc-200" />
    </div>
  );
}
