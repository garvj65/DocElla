import type { ExtractionWarning, PublicDocumentConfig } from "@docella/schemas/public";

import { Alert } from "../../components/ui/alert";

export function ExtractionWarnings({
  config,
  warnings,
}: {
  readonly config: PublicDocumentConfig;
  readonly warnings: readonly ExtractionWarning[];
}) {
  if (warnings.length === 0) {
    return null;
  }

  const labelByKey = new Map(config.fields.map((field) => [field.key, field.label]));

  return (
    <Alert>
      <div className="space-y-3">
        <p className="font-semibold">Extraction warnings</p>
        <ul className="space-y-2">
          {warnings.map((warning, index) => {
            const labels = (warning.fieldKeys ?? [])
              .map((fieldKey) => labelByKey.get(fieldKey))
              .filter((label): label is string => label !== undefined);

            return (
              <li key={`${warning.code}-${String(index)}`}>
                <span>{warning.message}</span>
                {labels.length > 0 ? (
                  <span className="block text-sm text-[var(--color-muted)]">
                    Fields: {labels.join(", ")}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </Alert>
  );
}
