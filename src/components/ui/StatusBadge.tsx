import { cx } from "@/lib/ui/classnames";

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "border-line bg-surface text-muted",
  brand: "border-brand/30 bg-brand-soft text-brand",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
  info: "border-info/30 bg-info/10 text-info",
};

export function StatusBadge({
  label,
  tone = "neutral",
  icon,
  className,
}: {
  label: string;
  tone?: Tone;
  icon?: string;
  className?: string;
}) {
  return (
    <span
      className={cx(
        // `text-center` matters: a badge is a flex item, so it is blockified to
        // `display:flex` and its text becomes an anonymous flex item. If the
        // badge is squeezed and the label wraps, `start` alignment leaves the
        // wrapped lines hugging the left edge of the leftover space.
        "inline-flex items-center justify-center gap-1.5 rounded-full border px-2.5 py-0.5 text-center text-xs font-semibold tracking-wide",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {icon ? (
        <span aria-hidden="true" className="text-[11px]">
          {icon}
        </span>
      ) : null}
      {label}
    </span>
  );
}
