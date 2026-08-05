import type { GenericReviewStatus } from "@docella/schemas/public";

const labels: Readonly<Record<GenericReviewStatus, string>> = {
  conflicting: "Conflict",
  low_ocr_confidence: "Low OCR",
  missing: "Missing",
  needs_review: "Review",
  verified: "Verified",
};

const classes: Readonly<Record<GenericReviewStatus, string>> = {
  conflicting: "border-amber-300 bg-amber-50 text-amber-900",
  low_ocr_confidence: "border-amber-300 bg-amber-50 text-amber-900",
  missing: "border-slate-300 bg-slate-50 text-slate-600",
  needs_review: "border-orange-300 bg-orange-50 text-orange-900",
  verified: "border-emerald-300 bg-emerald-50 text-emerald-800",
};

export function ReviewStatusChip({
  edited = false,
  status,
}: {
  readonly edited?: boolean;
  readonly status: GenericReviewStatus;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex min-h-6 items-center rounded border px-2 text-[11px] font-semibold uppercase tracking-wide ${classes[status]}`}
      >
        {labels[status]}
      </span>
      {edited ? (
        <span className="inline-flex min-h-6 items-center rounded border border-blue-300 bg-blue-50 px-2 text-[11px] font-semibold uppercase tracking-wide text-blue-800">
          Edited
        </span>
      ) : null}
    </span>
  );
}
