import { type PublicDocumentConfig, type PublicExtractionData } from "@docella/schemas/public";
import { useMemo, useState } from "react";

import type { SchemaApi } from "../../api/schema-api";
import { Button } from "../../components/ui/button";
import { TemplateSelector } from "../document-config/template-selector";
import { SchemaDrivenForm } from "../dynamic-form/dynamic-document-form";
import { FieldReviewBadge } from "./field-review-badge";
import { buildReviewedFormValues } from "./reviewed-form-values";

export function ReviewedDocumentForm({
  config,
  extraction,
  extractionId,
  schemaApi,
  onStartOver,
}: {
  readonly config: PublicDocumentConfig;
  readonly extraction: PublicExtractionData;
  readonly extractionId: string;
  readonly schemaApi: SchemaApi;
  readonly onStartOver: () => void;
}) {
  const initialValues = buildReviewedFormValues(config, extraction);
  const [selectedTemplateId, setSelectedTemplateId] = useState(config.templates[0]?.id ?? "");
  const selectedTemplateLabel = useMemo(
    () => config.templates.find((template) => template.id === selectedTemplateId)?.label ?? "",
    [config.templates, selectedTemplateId],
  );

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
        </>
      }
      generation={{
        buttonLabel: "Generate reviewed PDF",
        schemaApi,
        selectedTemplateId,
      }}
      initialValues={initialValues}
      onValid={() => undefined}
      resetLabel="Reset edits"
      submitLabel="Validate reviewed fields"
      title="Review extracted fields"
      validationSuccessMessage="Reviewed form is valid."
    >
      <aside aria-label="Reviewed PDF generation" className="space-y-4">
        <TemplateSelector
          onTemplateChange={setSelectedTemplateId}
          templateId={selectedTemplateId}
          templates={config.templates}
        />
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="font-medium text-[var(--color-muted)]">Selected template</dt>
            <dd>{selectedTemplateLabel}</dd>
          </div>
        </dl>
      </aside>
    </SchemaDrivenForm>
  );
}
