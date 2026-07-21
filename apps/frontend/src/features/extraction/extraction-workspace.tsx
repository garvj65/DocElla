import type { PublicExtractionResult } from "@docella/schemas/public";
import { FileSearch, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ExtractionApi } from "../../api/extraction-api";
import type { SchemaApi } from "../../api/schema-api";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import {
  useDocumentConfig,
  useDocumentSummaries,
} from "../document-config/queries";
import { SchemaSelector } from "../document-config/schema-selector";
import { ExtractionReviewWorkspace } from "../extraction-review/extraction-review-workspace";
import { ExtractionError } from "./extraction-error";
import { ExtractionProgress } from "./extraction-progress";
import { PdfUploadControl } from "./pdf-upload-control";
import {
  validatePdfFile,
  type PdfFileValidationResult,
} from "./pdf-file-validation";
import { useExtractionMutation } from "./use-extraction-mutation";

interface ExtractionWorkspaceProps {
  readonly extractionApi: ExtractionApi;
  readonly schemaApi: SchemaApi;
  readonly validateFile?: (
    files: readonly File[],
  ) => Promise<PdfFileValidationResult>;
}

export function ExtractionWorkspace({
  extractionApi,
  schemaApi,
  validateFile = validatePdfFile,
}: ExtractionWorkspaceProps) {
  const summariesQuery = useDocumentSummaries(schemaApi);
  const [selectedSchemaId, setSelectedSchemaId] = useState("");
  const configQuery = useDocumentConfig(schemaApi, selectedSchemaId);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileValidation, setFileValidation] =
    useState<PdfFileValidationResult | null>(null);
  const [result, setResult] = useState<{
    readonly id: string;
    readonly value: PublicExtractionResult;
  } | null>(null);
  const requestIdRef = useRef(0);
  const validationIdRef = useRef(0);
  const reviewRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const mutation = useExtractionMutation(extractionApi);

  useEffect(() => {
    if (summariesQuery.data === undefined || summariesQuery.data.length === 0) {
      setSelectedSchemaId("");
      return;
    }

    if (
      !summariesQuery.data.some((summary) => summary.id === selectedSchemaId)
    ) {
      setSelectedSchemaId(summariesQuery.data[0]?.id ?? "");
    }
  }, [selectedSchemaId, summariesQuery.data]);

  const invalidateValidation = () => {
    validationIdRef.current += 1;
  };

  const cancelActiveExtraction = () => {
    requestIdRef.current += 1;
    mutation.cancel();
    setResult(null);
  };

  const handleSchemaChange = (schemaId: string) => {
    invalidateValidation();
    cancelActiveExtraction();
    setSelectedFile(null);
    setFileValidation(null);
    setSelectedSchemaId(schemaId);
  };

  const handleFilesSelected = async (files: readonly File[]) => {
    const validationId = validationIdRef.current + 1;
    validationIdRef.current = validationId;
    cancelActiveExtraction();
    setSelectedFile(files.length === 1 ? (files[0] ?? null) : null);
    setFileValidation(null);
    const validation = await validateFile(files);
    if (validationIdRef.current === validationId) {
      setFileValidation(validation);
    }
  };

  const startOver = () => {
    invalidateValidation();
    cancelActiveExtraction();
    setSelectedFile(null);
    setFileValidation(null);
  };

  const canExtract =
    configQuery.data !== undefined &&
    selectedFile !== null &&
    fileValidation?.valid === true &&
    !mutation.isPending;

  const submitExtraction = async () => {
    const config = configQuery.data;
    const file = selectedFile;

    if (
      config === undefined ||
      file === null ||
      fileValidation?.valid !== true ||
      mutation.isPending
    ) {
      return;
    }

    const currentRequestId = requestIdRef.current + 1;
    requestIdRef.current = currentRequestId;
    setResult(null);
    mutation.reset();

    try {
      const extractionResult = await mutation.mutateAsync({
        config,
        file,
      });

      if (
        requestIdRef.current === currentRequestId &&
        extractionResult.data.schemaType === config.id &&
        extractionResult.data.documentVersion === config.version
      ) {
        setResult({
          id: `${String(currentRequestId)}-${extractionResult.meta.requestId}`,
          value: extractionResult,
        });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
    }
  };

  useEffect(() => {
    if (result !== null) {
      reviewRef.current?.focus();
    }
  }, [result]);

  useEffect(() => {
    if (mutation.isError) {
      errorRef.current?.focus();
    }
  }, [mutation.isError]);

  useEffect(
    () => () => {
      invalidateValidation();
      requestIdRef.current += 1;
    },
    [],
  );

  const selectedSchemaLabel = useMemo(
    () =>
      configQuery.data?.label ??
      summariesQuery.data?.find((summary) => summary.id === selectedSchemaId)
        ?.label ??
      "selected schema",
    [configQuery.data?.label, selectedSchemaId, summariesQuery.data],
  );

  if (summariesQuery.isLoading) {
    return <ExtractionSkeleton />;
  }

  if (summariesQuery.isError) {
    return (
      <Alert tone="error">
        <div className="space-y-3">
          <p>Document schemas could not be loaded.</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void summariesQuery.refetch()}
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            Retry
          </Button>
        </div>
      </Alert>
    );
  }

  if (summariesQuery.data === undefined || summariesQuery.data.length === 0) {
    return <Alert>No public document schemas are registered yet.</Alert>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <FileSearch
              aria-hidden="true"
              className="h-5 w-5 text-[var(--color-accent)]"
            />
            <div>
              <h2 className="text-xl font-semibold">PDF to Form</h2>
              <p className="text-sm text-[var(--color-muted)]">
                Upload a text-based PDF, review grounded fields, and validate
                edits locally.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <SchemaSelector
            disabled={mutation.isPending}
            onSchemaChange={handleSchemaChange}
            schemaId={selectedSchemaId}
            summaries={summariesQuery.data}
          />
          {configQuery.isLoading ? (
            <div className="space-y-2" role="status">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-11 w-full" />
            </div>
          ) : null}
          {configQuery.isError ? (
            <Alert tone="error">
              The selected schema details could not be loaded.
            </Alert>
          ) : null}
          <PdfUploadControl
            disabled={mutation.isPending}
            file={selectedFile}
            validation={fileValidation}
            onClear={() => {
              invalidateValidation();
              cancelActiveExtraction();
              setSelectedFile(null);
              setFileValidation(null);
            }}
            onFilesSelected={(files) => void handleFilesSelected(files)}
          />
          {mutation.isPending && selectedFile !== null ? (
            <ExtractionProgress
              filename={selectedFile.name}
              schemaLabel={selectedSchemaLabel}
              onCancel={cancelActiveExtraction}
            />
          ) : null}
          {mutation.isError ? (
            <ExtractionError
              error={mutation.error}
              ref={errorRef}
              onRetry={() => void submitExtraction()}
            />
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              disabled={!canExtract}
              type="button"
              onClick={() => void submitExtraction()}
            >
              <ShieldCheck aria-hidden="true" className="h-4 w-4" />
              Extract
            </Button>
            <Button type="button" variant="secondary" onClick={startOver}>
              Start over
            </Button>
          </div>
        </CardContent>
      </Card>
      {configQuery.data !== undefined && result !== null ? (
        <ExtractionReviewWorkspace
          config={configQuery.data}
          extractionId={result.id}
          ref={reviewRef}
          result={result.value}
          schemaApi={schemaApi}
          onStartOver={startOver}
        />
      ) : null}
    </div>
  );
}

function ExtractionSkeleton() {
  return (
    <Card role="status">
      <CardHeader>
        <Skeleton className="h-6 w-52" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-36 w-full" />
      </CardContent>
    </Card>
  );
}
