import { FileSearch, LoaderCircle, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { FrontendApiError } from "../../api/api-error";
import type { GenericDocumentApi } from "../../api/generic-document-api";
import { Button } from "../../components/ui/button";
import { GenericDocumentReview } from "./generic-document-review";
import { GENERIC_DOCUMENT_ACCEPT, validateGenericDocumentFile } from "./generic-document-file";

const extractionMessage = (error: FrontendApiError): string => {
  switch (error.code) {
    case "DOCUMENT_FORMAT_UNSUPPORTED":
      return "This document format is not supported.";
    case "DOCUMENT_SIGNATURE_INVALID":
      return "The document content does not match its declared format.";
    case "DOCUMENT_LAYOUT_PROVIDER_NOT_CONFIGURED":
      return "OCR and Office document analysis are not configured on this environment.";
    case "DOCUMENT_LAYOUT_PROVIDER_RATE_LIMITED":
      return "Document analysis is temporarily rate limited. Try again shortly.";
    case "DOCUMENT_LAYOUT_PROVIDER_TIMEOUT":
      return "Document analysis timed out. Try a smaller or clearer document.";
    case "DOCUMENT_LAYOUT_PROVIDER_UNAVAILABLE":
      return "The document analysis provider is temporarily unavailable.";
    case "GENERIC_SCHEMA_DISCOVERY_INVALID":
      return "DocElla could not discover a reliable structure for this document.";
    case "GENERIC_EXTRACTION_OUTPUT_INVALID":
      return "DocElla could not produce reliable structured values for this document.";
    case "EXTRACTION_PROVIDER_RATE_LIMITED":
      return "Structured extraction is temporarily rate limited. Try again shortly.";
    case "EXTRACTION_PROVIDER_TIMEOUT":
      return "Structured extraction timed out. Try again in a moment.";
    case "UPLOAD_TOO_LARGE":
      return "The document exceeds the 10 MiB limit.";
    default:
      return "Document analysis failed. Try again in a moment.";
  }
};

export function GenericExtractionWorkspace({ api }: { readonly api: GenericDocumentApi }) {
  const [file, setFile] = useState<File | undefined>();
  const [fileError, setFileError] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [state, setState] = useState<"idle" | "analyzing" | "error" | "complete">("idle");
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState<string | undefined>();
  const [result, setResult] = useState<
    Awaited<ReturnType<GenericDocumentApi["extract"]>> | undefined
  >();
  const inputRef = useRef<HTMLInputElement>(null);
  const validationIdRef = useRef(0);
  const extractionIdRef = useRef(0);
  const controllerRef = useRef<AbortController | undefined>();
  const errorRef = useRef<HTMLDivElement>(null);

  const cancelExtraction = useCallback(() => {
    extractionIdRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = undefined;
  }, []);

  const reset = useCallback(() => {
    validationIdRef.current += 1;
    cancelExtraction();
    setFile(undefined);
    setFileError("");
    setIsValidating(false);
    setState("idle");
    setError("");
    setRequestId(undefined);
    setResult(undefined);
    if (inputRef.current !== null) inputRef.current.value = "";
  }, [cancelExtraction]);

  useEffect(
    () => () => {
      validationIdRef.current += 1;
      cancelExtraction();
    },
    [cancelExtraction],
  );

  useEffect(() => {
    if (state === "error") errorRef.current?.focus();
  }, [state]);

  const selectFile = async (candidate: File | undefined): Promise<void> => {
    const validationId = validationIdRef.current + 1;
    validationIdRef.current = validationId;
    cancelExtraction();
    setFile(undefined);
    setFileError("");
    setState("idle");
    setError("");
    setRequestId(undefined);
    setResult(undefined);

    if (candidate === undefined) {
      setIsValidating(false);
      return;
    }

    setIsValidating(true);
    const validation = await validateGenericDocumentFile(candidate);
    if (validationIdRef.current !== validationId) return;
    setIsValidating(false);

    if (!validation.valid) {
      setFileError(validation.message ?? "The selected document is invalid.");
      if (inputRef.current !== null) inputRef.current.value = "";
      return;
    }

    setFile(candidate);
  };

  const analyze = async (): Promise<void> => {
    if (file === undefined || isValidating) return;
    cancelExtraction();
    const extractionId = extractionIdRef.current + 1;
    extractionIdRef.current = extractionId;
    const controller = new AbortController();
    controllerRef.current = controller;
    setState("analyzing");
    setError("");
    setRequestId(undefined);

    try {
      const extracted = await api.extract({ file, signal: controller.signal });
      if (extractionIdRef.current !== extractionId || controller.signal.aborted) return;
      setResult(extracted);
      setState("complete");
    } catch (cause) {
      if (extractionIdRef.current !== extractionId || controller.signal.aborted) return;
      if (cause instanceof FrontendApiError) {
        setError(extractionMessage(cause));
        setRequestId(cause.requestId);
      } else {
        setError("Document analysis failed. Try again in a moment.");
      }
      setState("error");
    } finally {
      if (extractionIdRef.current === extractionId) controllerRef.current = undefined;
    }
  };

  if (state === "complete" && result !== undefined && file !== undefined) {
    return <GenericDocumentReview file={file} onStartOver={reset} result={result} />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <section className="enterprise-panel px-5 py-5 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">
          Document intelligence
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
          Extract structured data from any business document
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Upload a digital or scanned PDF, image, Office document, or HTML file. DocElla discovers
          its structure, extracts values and tables, and grounds them for review.
        </p>
        <ol aria-label="Extraction progress" className="mt-5 grid gap-2 sm:grid-cols-3">
          {[
            ["1", "Upload", file === undefined ? "current" : "complete"],
            [
              "2",
              "Analyze",
              state === "analyzing" ? "current" : result === undefined ? "pending" : "complete",
            ],
            ["3", "Review", result === undefined ? "pending" : "current"],
          ].map(([number, label, status]) => (
            <li
              className={`flex items-center gap-3 rounded border px-3 py-2 text-sm ${
                status === "current"
                  ? "border-teal-300 bg-teal-50 text-teal-950"
                  : status === "complete"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-slate-200 bg-slate-50 text-slate-500"
              }`}
              key={number}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-current text-xs font-semibold">
                {number}
              </span>
              <span className="font-medium">{label}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="enterprise-panel p-5 sm:p-6">
        <input
          accept={GENERIC_DOCUMENT_ACCEPT}
          className="sr-only"
          id="generic-document-upload"
          ref={inputRef}
          type="file"
          onChange={(event) => void selectFile(event.target.files?.[0])}
        />
        <label
          className="flex min-h-64 cursor-pointer flex-col items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition hover:border-teal-500 hover:bg-teal-50/40 focus-within:ring-2 focus-within:ring-teal-200"
          htmlFor="generic-document-upload"
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            void selectFile(event.dataTransfer.files[0]);
          }}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded border border-slate-200 bg-white text-slate-500">
            <Upload aria-hidden="true" className="h-5 w-5" />
          </span>
          <span className="mt-4 text-sm font-semibold text-slate-900">
            Drop a document here or choose a file
          </span>
          <span className="mt-2 max-w-lg text-xs leading-5 text-slate-500">
            PDF, JPG, PNG, BMP, TIFF, HEIF, DOCX, XLSX, PPTX, or HTML · maximum 10 MiB
          </span>
        </label>

        {isValidating ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-slate-600" role="status">
            <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
            Checking document…
          </p>
        ) : null}

        {fileError.length > 0 ? (
          <div
            className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            role="alert"
          >
            {fileError}
          </div>
        ) : null}

        {file === undefined ? null : (
          <div className="mt-4 flex flex-col gap-3 rounded border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <FileSearch aria-hidden="true" className="h-5 w-5 shrink-0 text-teal-700" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{file.name}</p>
                <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KiB</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button disabled={state === "analyzing"} type="button" onClick={() => void analyze()}>
                {state === "analyzing" ? (
                  <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <FileSearch aria-hidden="true" className="h-4 w-4" />
                )}
                {state === "analyzing" ? "Analyzing…" : "Analyze document"}
              </Button>
              {state === "analyzing" ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    cancelExtraction();
                    setState("idle");
                  }}
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                  Cancel
                </Button>
              ) : (
                <Button type="button" variant="secondary" onClick={reset}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        )}

        <div aria-live="polite" className="mt-3 text-sm text-slate-600" role="status">
          {state === "analyzing"
            ? "Analyzing layout, discovering a schema, extracting values, and grounding evidence."
            : null}
        </div>

        {state === "error" ? (
          <div
            aria-live="assertive"
            className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800"
            ref={errorRef}
            role="alert"
            tabIndex={-1}
          >
            <p>{error}</p>
            {requestId === undefined ? null : (
              <p className="mt-1 text-xs">Request ID: {requestId}</p>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
