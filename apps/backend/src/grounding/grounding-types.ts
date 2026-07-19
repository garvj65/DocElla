import type {
  DocumentDefinition,
  ExtractionData,
  ExtractionWarning,
  FieldReviewMap,
} from "@docella/schemas";

export interface GroundingRequest {
  readonly documentDefinition: DocumentDefinition;
  readonly documentText: string;
  readonly values: ExtractionData;
}

export interface GroundingSummary {
  readonly fields: FieldReviewMap;
  readonly confidence: number;
  readonly warnings: readonly ExtractionWarning[];
  readonly verifiedFields: number;
  readonly needsReviewFields: number;
  readonly missingFields: number;
  readonly requiredMissingFields: number;
  readonly reviewRequired: boolean;
}

export interface GroundingService {
  readonly ground: (request: GroundingRequest) => GroundingSummary;
}

export interface SourceRepresentations {
  readonly minimal: string;
  readonly search: string;
  readonly email: string;
  readonly phoneDigitSequences: readonly string[];
  readonly numericMentions: readonly number[];
}
