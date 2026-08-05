import type {
  DiscoveredDocumentSchema,
  GenericDocumentExtractionResult,
  GenericDocumentValues,
} from "@docella/schemas";

import type {
  DocumentLayoutRequest,
  DocumentLayoutResult,
  ValidatedDocumentInput,
} from "../document-layout/document-layout-types.js";

export interface GenericSchemaDiscoveryRequest {
  readonly layout: DocumentLayoutResult;
  readonly signal?: AbortSignal;
}

export interface GenericSchemaDiscoverer {
  readonly discover: (request: GenericSchemaDiscoveryRequest) => Promise<DiscoveredDocumentSchema>;
}

export interface GenericValueExtractionRequest {
  readonly documentSchema: DiscoveredDocumentSchema;
  readonly layout: DocumentLayoutResult;
  readonly signal?: AbortSignal;
}

export interface GenericValueExtractor {
  readonly extract: (request: GenericValueExtractionRequest) => Promise<GenericDocumentValues>;
}

export interface GenericGroundingRequest {
  readonly documentSchema: DiscoveredDocumentSchema;
  readonly inputTruncated: boolean;
  readonly layout: DocumentLayoutResult;
  readonly values: GenericDocumentValues;
}

export interface GenericGroundingService {
  readonly ground: (request: GenericGroundingRequest) => GenericDocumentExtractionResult;
}

export interface GenericDocumentExtractionRequest extends ValidatedDocumentInput {
  readonly signal?: AbortSignal;
}

export interface GenericDocumentExtractionService {
  readonly extract: (
    request: GenericDocumentExtractionRequest,
  ) => Promise<GenericDocumentExtractionResult>;
}

export const toLayoutRequest = (
  request: GenericDocumentExtractionRequest,
): DocumentLayoutRequest =>
  request.signal === undefined
    ? {
        bytes: request.bytes,
        filename: request.filename,
        mediaType: request.mediaType,
        sourceFormat: request.sourceFormat,
      }
    : {
        bytes: request.bytes,
        filename: request.filename,
        mediaType: request.mediaType,
        signal: request.signal,
        sourceFormat: request.sourceFormat,
      };
