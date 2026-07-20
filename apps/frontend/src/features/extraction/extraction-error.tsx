import { RefreshCw } from "lucide-react";
import { forwardRef } from "react";

import { FrontendApiError } from "../../api/api-error";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";

const retryableCodes = new Set([
  "EXTRACTION_RATE_LIMITED",
  "EXTRACTION_PROVIDER_TIMEOUT",
  "EXTRACTION_PROVIDER_RATE_LIMITED",
  "EXTRACTION_PROVIDER_UNAVAILABLE",
  "PDF_PARSE_TIMEOUT",
]);

const messageForCode = (code: string): string => {
  switch (code) {
    case "UPLOAD_TOO_LARGE":
      return "The PDF is larger than the 10 MiB upload limit.";
    case "UPLOAD_INVALID_TYPE":
    case "PDF_INVALID":
      return "The selected file could not be read as a valid PDF.";
    case "PDF_PASSWORD_PROTECTED":
      return "Password-protected PDFs are not supported.";
    case "PDF_NO_EXTRACTABLE_TEXT":
      return "No extractable text was found. Scanned PDFs require OCR, which is not supported yet.";
    case "PDF_PAGE_LIMIT_EXCEEDED":
      return "The PDF has more pages than this workflow supports.";
    case "PDF_TEXT_LIMIT_EXCEEDED":
      return "The PDF contains more text than this workflow currently supports.";
    case "EXTRACTION_PROVIDER_TIMEOUT":
    case "EXTRACTION_PROVIDER_RATE_LIMITED":
    case "EXTRACTION_PROVIDER_UNAVAILABLE":
      return "The extraction service is temporarily unavailable. Try again shortly.";
    case "EXTRACTION_OUTPUT_INVALID":
    case "MALFORMED_EXTRACTION_RESULT":
      return "The document could not be converted into a valid structured result.";
    case "EXTRACTION_RATE_LIMITED":
      return "Too many extraction attempts were made. Try again shortly.";
    default:
      return "The extraction request could not be completed.";
  }
};

export const ExtractionError = forwardRef<
  HTMLDivElement,
  { readonly error: unknown; readonly onRetry: () => void }
>(function ExtractionError({ error, onRetry }, ref) {
  const apiError = error instanceof FrontendApiError ? error : undefined;
  const code = apiError?.code ?? "UNKNOWN";
  const canRetry = retryableCodes.has(code);

  return (
    <Alert ref={ref} tone="error">
      <div className="space-y-3">
        <div>
          <p>{messageForCode(code)}</p>
          {apiError?.requestId === undefined ? null : (
            <p className="mt-1 text-xs">Request ID: {apiError.requestId}</p>
          )}
        </div>
        {canRetry ? (
          <Button type="button" variant="secondary" onClick={onRetry}>
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            Retry
          </Button>
        ) : null}
      </div>
    </Alert>
  );
});
