import type { PublicDocumentConfig, PublicExtractionMeta } from "@docella/schemas/public";

import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader } from "../../components/ui/card";

export function ExtractionSummary({
  config,
  meta,
}: {
  readonly config: PublicDocumentConfig;
  readonly meta: PublicExtractionMeta;
}) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl font-semibold">Extraction review</h2>
        <p className="text-sm text-[var(--color-muted)]">{config.label}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryItem label="Pages" value={String(meta.pageCount)} />
          <SummaryItem
            label="Grounding confidence"
            value={`${String(Math.round(meta.confidence * 100))}%`}
          />
          <SummaryItem label="Verified" value={String(meta.verifiedFields)} />
          <SummaryItem label="Needs review" value={String(meta.needsReviewFields)} />
          <SummaryItem label="Missing" value={String(meta.missingFields)} />
          <SummaryItem label="Required missing" value={String(meta.requiredMissingFields)} />
          <SummaryItem label="Review required" value={meta.reviewRequired ? "Yes" : "No"} />
        </div>
        <p className="text-sm text-[var(--color-muted)]">
          Grounding confidence is a deterministic review heuristic for the original extraction, not
          a probability or guarantee. Editing fields does not recompute grounding.
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge>Request ID: {meta.requestId}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryItem({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-white p-3">
      <dt className="text-xs font-semibold uppercase text-[var(--color-muted)]">{label}</dt>
      <dd className="mt-1 text-lg font-semibold">{value}</dd>
    </div>
  );
}
