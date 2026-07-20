import type { PublicDocumentConfig } from "@docella/schemas/public";

import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import type { ValidationState } from "./form-types";

interface FormSummaryProps {
  readonly config: PublicDocumentConfig;
  readonly selectedTemplateLabel: string;
  readonly selectedTemplateId: string;
  readonly validationState: ValidationState;
}

export function FormSummary({
  config,
  selectedTemplateId,
  selectedTemplateLabel,
  validationState,
}: FormSummaryProps) {
  const selectedTemplate = config.templates.find((template) => template.id === selectedTemplateId);
  const requiredCount = config.fields.filter((field) => field.required).length;
  const optionalCount = config.fields.length - requiredCount;

  return (
    <aside aria-labelledby="summary-heading">
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold" id="summary-heading">
            Form summary
          </h2>
          <p className="text-sm text-[var(--color-muted)]">Safe schema and validation metadata.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <SummaryRow label="Schema" value={config.label} />
          <SummaryRow label="Template" value={selectedTemplateLabel} />
          <div className="flex flex-wrap gap-2">
            <Badge>{config.fields.length} fields</Badge>
            <Badge>{requiredCount} required</Badge>
            <Badge>{optionalCount} optional</Badge>
          </div>
          <SummaryRow
            label="Template default"
            value={selectedTemplate?.flattenByDefault ? "Flattened output" : "Editable output"}
          />
          <div aria-live="polite" className="rounded-md bg-[var(--color-panel-muted)] p-3 text-sm">
            Local validation: {validationState}
          </div>
        </CardContent>
      </Card>
    </aside>
  );
}

function SummaryRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string | undefined;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-[var(--color-muted)]">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-[var(--color-ink)]">{value ?? "Unavailable"}</dd>
    </div>
  );
}
