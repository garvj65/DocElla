import { type PublicDocumentConfig, type PublicExtractionData } from "@docella/schemas/public";

import { Button } from "../../components/ui/button";
import { SchemaDrivenForm } from "../dynamic-form/dynamic-document-form";
import { FieldReviewBadge } from "./field-review-badge";
import { buildReviewedFormValues } from "./reviewed-form-values";

export function ReviewedDocumentForm({
  config,
  extraction,
  extractionId,
  onStartOver,
}: {
  readonly config: PublicDocumentConfig;
  readonly extraction: PublicExtractionData;
  readonly extractionId: string;
  readonly onStartOver: () => void;
}) {
  const initialValues = buildReviewedFormValues(config, extraction);

  return (
    <SchemaDrivenForm
      key={`${config.id}-${String(config.version)}-${extractionId}`}
      config={config}
      fieldAccessory={(fieldKey, dirty) => (
        <FieldReviewBadge
          edited={dirty}
          review={
            extraction.review[fieldKey] ?? {
              confidence: 0,
              matchType: "none",
              status: "missing",
            }
          }
        />
      )}
      footerContent={
        <>
          <Button type="button" variant="secondary" onClick={onStartOver}>
            Start over
          </Button>
          <Button disabled type="button" variant="ghost">
            PDF download connects in T10
          </Button>
        </>
      }
      initialValues={initialValues}
      onValid={() => undefined}
      resetLabel="Reset edits"
      submitLabel="Validate reviewed fields"
      title="Review extracted fields"
      validationSuccessMessage="Reviewed form is valid."
    />
  );
}
