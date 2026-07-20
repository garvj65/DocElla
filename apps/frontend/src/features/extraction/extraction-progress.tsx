import { Loader2 } from "lucide-react";

import { Button } from "../../components/ui/button";

export function ExtractionProgress({
  filename,
  schemaLabel,
  onCancel,
}: {
  readonly filename: string;
  readonly schemaLabel: string;
  readonly onCancel: () => void;
}) {
  return (
    <div
      className="space-y-3 rounded-lg border border-[var(--color-border)] bg-white p-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <Loader2
          aria-hidden="true"
          className="h-5 w-5 animate-spin motion-reduce:animate-none text-[var(--color-primary)]"
        />
        <div>
          <p className="font-semibold">Extracting {schemaLabel}</p>
          <p className="text-sm text-[var(--color-muted)]">{filename}</p>
        </div>
      </div>
      <p className="text-sm text-[var(--color-muted)]">
        Parsing and structured extraction may take a little while.
      </p>
      <Button type="button" variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
