import { cx } from "@/lib/ui/classnames";

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-line bg-surface p-10 text-center">
      <p className="text-sm font-semibold">{title}</p>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title, description, retry }: { title: string; description?: string; retry?: () => void }) {
  return (
    <div role="alert" className="rounded-card border border-danger/30 bg-danger/5 p-6">
      <p className="flex items-center gap-2 text-sm font-semibold text-danger">
        <span aria-hidden="true">⚠</span> {title}
      </p>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      {retry ? (
        <button type="button" onClick={retry} className="mt-3 rounded-control border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-canvas">
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function SkeletonState({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cx("space-y-3 rounded-card border border-line bg-surface p-6", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-canvas" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}
