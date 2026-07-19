import type {
  DocumentDefinition,
  ExtractionData,
  ExtractionWarning,
  FieldReviewMap,
} from "@docella/schemas";

export interface PdfTextExtractionOptions {
  readonly maxInputCharacters: number;
  readonly maxPages?: number;
  readonly minExtractedNonWhitespaceCharacters?: number;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export interface PdfTextExtractionResult {
  readonly text: string;
  readonly pageCount: number;
  readonly characterCount: number;
}

export interface PdfTextExtractor {
  readonly extract: (
    pdfBytes: Uint8Array,
    options: PdfTextExtractionOptions,
  ) => Promise<PdfTextExtractionResult>;
}

export interface StructuredExtractionRequest {
  readonly documentDefinition: DocumentDefinition;
  readonly documentText: string;
  readonly signal?: AbortSignal;
}

export interface StructuredExtractor {
  readonly extract: (request: StructuredExtractionRequest) => Promise<ExtractionData>;
}

export interface DocumentExtractionRequest {
  readonly documentDefinition: DocumentDefinition;
  readonly pdfBytes: Uint8Array;
  readonly signal?: AbortSignal;
}

export interface DocumentExtractionResult {
  readonly schemaType: string;
  readonly documentVersion: number;
  readonly values: ExtractionData;
  readonly review: FieldReviewMap;
  readonly confidence: number;
  readonly warnings: readonly ExtractionWarning[];
  readonly reviewRequired: boolean;
  readonly verifiedFields: number;
  readonly needsReviewFields: number;
  readonly missingFields: number;
  readonly requiredMissingFields: number;
  readonly model: string;
  readonly pageCount: number;
  readonly extractedCharacters: number;
}

export interface DocumentExtractionService {
  readonly extract: (request: DocumentExtractionRequest) => Promise<DocumentExtractionResult>;
}
