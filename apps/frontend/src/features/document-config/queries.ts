import { useQuery } from "@tanstack/react-query";

import type { SchemaApi } from "../../api/schema-api";
import { schemaQueryKeys } from "../../api/query-keys";

export const useDocumentSummaries = (schemaApi: SchemaApi) =>
  useQuery({
    queryFn: ({ signal }) => schemaApi.listDocumentSummaries(signal),
    queryKey: schemaQueryKeys.list(),
  });

export const useDocumentConfig = (schemaApi: SchemaApi, schemaType: string) =>
  useQuery({
    enabled: schemaType.length > 0,
    queryFn: ({ signal }) => schemaApi.getDocumentConfig(schemaType, signal),
    queryKey: schemaQueryKeys.detail(schemaType),
  });
