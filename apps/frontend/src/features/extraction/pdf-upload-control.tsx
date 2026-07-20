import { FileUp, Trash2 } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/cn";
import { formatFileSize, type PdfFileValidationResult } from "./pdf-file-validation";

interface PdfUploadControlProps {
  readonly disabled?: boolean;
  readonly file: File | null;
  readonly validation: PdfFileValidationResult | null;
  readonly onClear: () => void;
  readonly onFilesSelected: (files: readonly File[]) => void;
}

export function PdfUploadControl({
  disabled = false,
  file,
  onClear,
  onFilesSelected,
  validation,
}: PdfUploadControlProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div className="space-y-3">
      <label className="text-sm font-semibold" htmlFor={inputId}>
        PDF file
      </label>
      <div
        className={cn(
          "rounded-lg border border-dashed border-[var(--color-border)] bg-white p-5",
          dragging && "border-[var(--color-primary)] bg-teal-50",
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragging(false);
        }}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) {
            onFilesSelected(Array.from(event.dataTransfer.files));
          }
        }}
      >
        <input
          accept="application/pdf,.pdf"
          aria-describedby={validation?.valid === false ? errorId : undefined}
          className="sr-only"
          disabled={disabled}
          id={inputId}
          onChange={(event) => {
            onFilesSelected(Array.from(event.currentTarget.files ?? []));
          }}
          ref={inputRef}
          type="file"
        />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2 text-sm text-[var(--color-muted)]">
            <p className="font-medium text-[var(--color-ink)]">
              Choose one text-based PDF, or drop it here.
            </p>
            <p>Maximum 10 MiB. Scanned or image-only PDFs require OCR and are unsupported.</p>
            <p>Files are sent only after you choose Extract and are not persistently stored.</p>
          </div>
          <Button
            disabled={disabled}
            type="button"
            variant="secondary"
            onClick={() => inputRef.current?.click()}
          >
            <FileUp aria-hidden="true" className="h-4 w-4" />
            Choose PDF
          </Button>
        </div>
      </div>
      {file === null ? null : (
        <div className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-panel-muted)] p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span>
            Selected: <span className="font-semibold">{file.name}</span> (
            {formatFileSize(file.size)})
          </span>
          <Button disabled={disabled} type="button" variant="ghost" onClick={onClear}>
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            Clear file
          </Button>
        </div>
      )}
      {validation?.valid === false ? (
        <Alert id={errorId} tone="error">
          {validation.message}
        </Alert>
      ) : null}
    </div>
  );
}
