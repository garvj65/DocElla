import type { PublicDocumentConfig, PublicExtractionResult } from "@docella/schemas/public";
import { forwardRef } from "react";

import { ExtractionSummary } from "./extraction-summary";
import { ExtractionWarnings } from "./extraction-warnings";
import { ReviewedDocumentForm } from "./reviewed-document-form";

export const ExtractionReviewWorkspace = forwardRef<
  HTMLDivElement,
  {
    readonly config: PublicDocumentConfig;
    readonly extractionId: string;
    readonly result: PublicExtractionResult;
    readonly onStartOver: () => void;
  }
>(function ExtractionReviewWorkspace({ config, extractionId, onStartOver, result }, ref) {
  return (
    <section className="space-y-6" ref={ref} tabIndex={-1}>
      <ExtractionSummary config={config} meta={result.meta} />
      <ExtractionWarnings config={config} warnings={result.meta.warnings} />
      <ReviewedDocumentForm
        config={config}
        extraction={result.data}
        extractionId={extractionId}
        onStartOver={onStartOver}
      />
    </section>
  );
});
