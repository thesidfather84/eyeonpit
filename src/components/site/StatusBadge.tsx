export type FeatureStatus = "available" | "in-development" | "planned";

const STATUS_LABEL: Record<FeatureStatus, string> = {
  available: "Available Now",
  "in-development": "In Development",
  planned: "Planned",
};

const STATUS_CLASSES: Record<FeatureStatus, string> = {
  available: "border-status-green/40 bg-status-green/10 text-status-green",
  "in-development": "border-pending/40 bg-pending/10 text-pending",
  planned: "border-border bg-surface-raised text-muted-foreground",
};

/**
 * The mandatory current/future labeling the EyeOnPit 1.4 site rule requires
 * everywhere a feature is described — never implied by copy tone alone.
 * One shared component so the three states always render identically
 * (homepage feature cards, docs pages, FAQ answers).
 */
export function StatusBadge({ status, className = "" }: { status: FeatureStatus; className?: string }) {
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${STATUS_CLASSES[status]} ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}
