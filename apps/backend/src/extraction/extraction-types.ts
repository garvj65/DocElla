import type { DocumentDefinition, ExtractionData } from "@docella/schemas";

export interface PdfTextExtractionOptions {
  readonly maxInputCharacters: number;
  readonly maxPages?: number;
  readonly minExtractedNonWhitespaceCharacters?: number;
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
}

export interface StructuredExtractor {
  readonly extract: (request: StructuredExtractionRequest) => Promise<ExtractionData>;
}

export interface DocumentExtractionRequest {
  readonly documentDefinition: DocumentDefinition;
  readonly pdfBytes: Uint8Array;
}

export interface DocumentExtractionResult {
  readonly schemaType: string;
  readonly documentVersion: number;
  readonly values: ExtractionData;
  readonly model: string;
  readonly pageCount: number;
  readonly extractedCharacters: number;
}

export interface DocumentExtractionService {
  readonly extract: (request: DocumentExtractionRequest) => Promise<DocumentExtractionResult>;
}
