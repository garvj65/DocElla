import { useEffect, useMemo, useState } from "react";

import type { PublicDocumentConfig, PublicDocumentSummary } from "@docella/schemas/public";

export interface DocumentSelection {
  readonly selectedSchemaId: string;
  readonly selectedTemplateId: string;
  readonly selectedTemplateLabel: string;
  readonly setSelectedSchemaId: (schemaId: string) => void;
  readonly setSelectedTemplateId: (templateId: string) => void;
}

export const useDocumentSelection = (
  summaries: readonly PublicDocumentSummary[] | undefined,
  config: PublicDocumentConfig | undefined,
): DocumentSelection => {
  const [selectedSchemaId, setSelectedSchemaId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  useEffect(() => {
    if (summaries === undefined || summaries.length === 0) {
      setSelectedSchemaId("");
      return;
    }

    if (!summaries.some((summary) => summary.id === selectedSchemaId)) {
      setSelectedSchemaId(summaries[0]?.id ?? "");
    }
  }, [selectedSchemaId, summaries]);

  useEffect(() => {
    setSelectedTemplateId("");
  }, [selectedSchemaId]);

  useEffect(() => {
    if (config === undefined || config.templates.length === 0) {
      setSelectedTemplateId("");
      return;
    }

    if (!config.templates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(config.templates[0]?.id ?? "");
    }
  }, [config, selectedTemplateId]);

  const selectedTemplateLabel = useMemo(
    () => config?.templates.find((template) => template.id === selectedTemplateId)?.label ?? "",
    [config, selectedTemplateId],
  );

  return {
    selectedSchemaId,
    selectedTemplateId,
    selectedTemplateLabel,
    setSelectedSchemaId,
    setSelectedTemplateId,
  };
};
