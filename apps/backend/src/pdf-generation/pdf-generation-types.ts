import type { DocumentDefinition, SubmissionData, TemplateDefinition } from "@docella/schemas";

export interface PdfGenerationRequest {
  readonly documentDefinition: DocumentDefinition;
  readonly template: TemplateDefinition;
  readonly values: SubmissionData;
  readonly flatten?: boolean;
  readonly signal?: AbortSignal;
}

export interface GeneratedPdf {
  readonly bytes: Uint8Array;
  readonly filename: string;
  readonly flattened: boolean;
  readonly schemaType: string;
  readonly templateId: string;
}

export interface PdfGenerationService {
  readonly generate: (request: PdfGenerationRequest) => Promise<GeneratedPdf>;
}
