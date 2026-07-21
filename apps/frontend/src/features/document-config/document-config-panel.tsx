import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import type { SchemaApi } from "../../api/schema-api";
import { useDocumentConfig, useDocumentSummaries } from "./queries";
import { SchemaSelector } from "./schema-selector";
import { TemplateSelector } from "./template-selector";

interface DocumentConfigPanelProps {
  readonly children: (state: {
    readonly config: NonNullable<ReturnType<typeof useDocumentConfig>["data"]>;
    readonly selectedTemplateId: string;
    readonly selectedTemplateLabel: string;
  }) => ReactNode;
  readonly schemaApi: SchemaApi;
}

export function DocumentConfigPanel({ children, schemaApi }: DocumentConfigPanelProps) {
  const summariesQuery = useDocumentSummaries(schemaApi);
  const [selectedSchemaId, setSelectedSchemaId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const configQuery = useDocumentConfig(schemaApi, selectedSchemaId);

  useEffect(() => {
    if (summariesQuery.data === undefined || summariesQuery.data.length === 0) {
      setSelectedSchemaId("");
      return;
    }

    if (!summariesQuery.data.some((summary) => summary.id === selectedSchemaId)) {
      setSelectedSchemaId(summariesQuery.data[0]?.id ?? "");
    }
  }, [selectedSchemaId, summariesQuery.data]);

  useEffect(() => {
    setSelectedTemplateId("");
  }, [selectedSchemaId]);

  useEffect(() => {
    if (configQuery.data === undefined || configQuery.data.templates.length === 0) {
      setSelectedTemplateId("");
      return;
    }

    if (!configQuery.data.templates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(configQuery.data.templates[0]?.id ?? "");
    }
  }, [configQuery.data, selectedTemplateId]);

  const selectedTemplateLabel = useMemo(
    () =>
      configQuery.data?.templates.find((template) => template.id === selectedTemplateId)?.label ??
      "",
    [configQuery.data, selectedTemplateId],
  );

  if (summariesQuery.isLoading) {
    return <SelectorSkeleton />;
  }

  if (summariesQuery.isError) {
    return (
      <ErrorState
        message="Document schemas could not be loaded."
        onRetry={() => void summariesQuery.refetch()}
      />
    );
  }

  if (summariesQuery.data?.length === 0 || summariesQuery.data === undefined) {
    return (
      <Alert>
        No public document schemas are registered yet. The form workspace will appear once schemas
        are available.
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold">Form to PDF</h2>
          <p className="text-sm text-[var(--color-muted)]">
            Choose a document schema and trusted template, complete the generated form, then download
            an editable or flattened PDF.
          </p>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <SchemaSelector
            onSchemaChange={setSelectedSchemaId}
            schemaId={selectedSchemaId}
            summaries={summariesQuery.data}
          />
          {configQuery.isLoading ? (
            <div className="space-y-2" role="status">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-6 w-44" />
            </div>
          ) : null}
          {configQuery.isError ? (
            <ErrorState
              message="The selected schema details could not be loaded."
              onRetry={() => void configQuery.refetch()}
            />
          ) : null}
          {configQuery.data?.templates.length === 0 ? (
            <Alert tone="error">This schema has no public templates registered.</Alert>
          ) : null}
          {configQuery.data?.templates.length !== undefined &&
          configQuery.data.templates.length > 0 ? (
            <TemplateSelector
              onTemplateChange={setSelectedTemplateId}
              templateId={selectedTemplateId}
              templates={configQuery.data.templates}
            />
          ) : null}
        </CardContent>
      </Card>
      {configQuery.data !== undefined && selectedTemplateId.length > 0
        ? children({
            config: configQuery.data,
            selectedTemplateId,
            selectedTemplateLabel,
          })
        : null}
    </div>
  );
}

function SelectorSkeleton() {
  return (
    <Card role="status">
      <CardHeader>
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-2">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </CardContent>
    </Card>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry: () => void;
}) {
  return (
    <Alert tone="error">
      <div className="space-y-3">
        <p>{message}</p>
        <Button type="button" variant="secondary" onClick={onRetry}>
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          Retry
        </Button>
      </div>
    </Alert>
  );
}
